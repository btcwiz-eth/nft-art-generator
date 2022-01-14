#!/usr/bin/env node

//TODO
//CHECK FOR TRAILING SLASHES ON ALL INPUTS

//IMPORTS
const chalk = require('chalk');
const boxen = require('boxen');
const ora = require('ora');
const inquirer = require('inquirer');
const fs = require('fs');
const { readFile, writeFile, readdir } = require("fs").promises;
const mergeImages = require('merge-images');
const { Image, Canvas } = require('canvas');
const ImageDataURI = require('image-data-uri');

// COMMON FILE NAME
const blank = 'none.png';
const snakeb = 'snake-b.png';
const robotb = 'robot-b.png';
const pair = {
  snake: {
    'snake-b.png': 'snake-a.png'
  },
  headphones: {
    'a2.png': 'a1.png',
    'b2.png': 'b1.png',
    'c2.png': 'c1.png',
    'd2.png': 'd1.png',
    'e2.png': 'e1.png',
    'f2.png': 'f1.png',
    'g2.png': 'g1.png',
    'h2.png': 'h1.png',
  },
  fullbody: {
    'robot-b.png': 'robot-a.png'
  }
}

//SETTINGS
let basePath;
let outputPath;
let traits;
let traitsToSort = [];
let order = []
let weights = {};
let names = {};
let weightedTraits = [];
let seen = [];
let metaData = {};
let config = {
  metaData: {},
  useCustomNames: null,
  deleteDuplicates: true,
  generateMetadata: null,
  order: [
    'back',
    'l-hands',
    'body',
    'skin',
    'exposed-cloth',
    'r-hands',
    'cloth',
    'necklaces',
    'overheadphones-l',
    'headphones-l',
    'head',
    'eyes',
    'nose',
    'mouth',
    'hats',
    'overheadphones-r',
    'headphones-r',
    'fullbody',
    'ear',
    'front',
    'pet'
  ],
};
let argv = require('minimist')(process.argv.slice(2));

//DEFINITIONS
const getDirectories = source =>
  fs
    .readdirSync(source, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);

const sleep = seconds => new Promise(resolve => setTimeout(resolve, seconds * 1000))

main();

async function main() {
  await loadConfig();
  await getBasePath();
  await getOutputPath();
  await generateMetadataPrompt();
  if (config.generateMetadata) {
    await metadataSettings();
  }
  const loadingDirectories = ora('Loading traits');
  loadingDirectories.color = 'yellow';
  loadingDirectories.start();
  traits = getDirectories(basePath);
  traitsToSort = [...traits];
  await sleep(2);
  loadingDirectories.succeed();
  loadingDirectories.clear();
  await traitsOrder(true);
  await customNamesPrompt();
  await asyncForEach(traits, async trait => {
    await setNames(trait);
  });
  await asyncForEach(traits, async trait => {
    await setWeights(trait);
  });
  const generatingImages = ora('Generating images');
  generatingImages.color = 'yellow';
  generatingImages.start();
  await generateImages();
  await sleep(2);
  generatingImages.succeed('All images generated!');
  generatingImages.clear();
  if (config.generateMetadata) {
    const writingMetadata = ora('Exporting metadata');
    writingMetadata.color = 'yellow';
    writingMetadata.start();
    await writeMetadata();
    await sleep(0.5);
    writingMetadata.succeed('Exported metadata successfully');
    writingMetadata.clear();
  }
  if (argv['save-config']) {
    const writingConfig = ora('Saving configuration');
    writingConfig.color = 'yellow';
    writingConfig.start();
    await writeConfig();
    await sleep(0.5);
    writingConfig.succeed('Saved configuration successfully');
    writingConfig.clear();
  }
}

//GET THE BASEPATH FOR THE IMAGES
async function getBasePath() {
  if (config.basePath !== undefined) {
    basePath = config.basePath;
    return;
  }
  const { base_path } = await inquirer.prompt([
    {
      type: 'list',
      name: 'base_path',
      message: 'Where are your images located?',
      choices: [
        { name: 'In the current directory', value: 0 },
        { name: 'Somewhere else on my computer', value: 1 },
      ],
    },
  ]);
  if (base_path === 0) {
    basePath = process.cwd() + '/images/';
  } else {
    const { file_location } = await inquirer.prompt([
      {
        type: 'input',
        name: 'file_location',
        message: 'Enter the path to your image files (Absolute filepath)',
      },
    ]);
    let lastChar = file_location.slice(-1);
    if (lastChar === '/') basePath = file_location;
    else basePath = file_location + '/';
  }
  config.basePath = basePath;
}

//GET THE OUTPUTPATH FOR THE IMAGES
async function getOutputPath() {
  if (config.outputPath !== undefined) {
    outputPath = config.outputPath
    return;
  }
  const { output_path } = await inquirer.prompt([
    {
      type: 'list',
      name: 'output_path',
      message: 'Where should the generated images be exported?',
      choices: [
        { name: 'In the current directory', value: 0 },
        { name: 'Somewhere else on my computer', value: 1 },
      ],
    },
  ]);
  if (output_path === 0) {
    outputPath = process.cwd() + '/output/';
  } else {
    const { file_location } = await inquirer.prompt([
      {
        type: 'input',
        name: 'file_location',
        message:
          'Enter the path to your output_old directory (Absolute filepath)',
      },
    ]);
    let lastChar = file_location.slice(-1);
    if (lastChar === '/') outputPath = file_location;
    else outputPath = file_location + '/';
  }
  config.outputPath = outputPath;
}

async function generateMetadataPrompt() {
  if (config.generateMetadata !== null) return;
  let { createMetadata } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'createMetadata',
      message: 'Should metadata be generated?',
    },
  ]);
  config.generateMetadata = createMetadata;
}

async function metadataSettings() {
  if (Object.keys(config.metaData).length !== 0) return;
  let responses = await inquirer.prompt([
    {
      type: 'input',
      name: 'metadataName',
      message: 'What should be the name? (Generated format is NAME#ID)',
    },
    {
      type: 'input',
      name: 'metadataDescription',
      message: 'What should be the description?',
    },
    {
      type: 'input',
      name: 'metadataImageUrl',
      message: 'What should be the image url? (Generated format is URL/ID)',
    },
    {
      type: 'confirm',
      name: 'splitFiles',
      message: 'Should JSON metadata be split in multiple files?',
    },
  ]);
  config.metaData.name = responses.metadataName;
  config.metaData.description = responses.metadataDescription;
  config.metaData.splitFiles = responses.splitFiles;
  let lastChar = responses.metadataImageUrl.slice(-1);
  if (lastChar === '/') config.imageUrl = responses.metadataImageUrl;
  else config.imageUrl = responses.metadataImageUrl + '/';
}

//SELECT THE ORDER IN WHICH THE TRAITS SHOULD BE COMPOSITED
async function traitsOrder(isFirst) {
  if (config.order && config.order.length === traits.length) {
    const arr = [];

    for (let t of config.order) {
      arr.push(traits.indexOf(t));
    }

    order = arr;
    return;
  }

  const traitsPrompt = {
    type: 'list',
    name: 'selected',
    choices: [],
  };
  traitsPrompt.message = 'Which trait should be on top of that?';
  if (isFirst === true) traitsPrompt.message = 'Which trait is the background?';
  traitsToSort.forEach(trait => {
    const globalIndex = traits.indexOf(trait);
    traitsPrompt.choices.push({
      name: trait.toUpperCase(),
      value: globalIndex,
    });
  });
  const { selected } = await inquirer.prompt(traitsPrompt);
  console.log(selected);
  order.push(selected);
  config.order = order;
  let localIndex = traitsToSort.indexOf(traits[selected]);
  traitsToSort.splice(localIndex, 1);
  if (order.length === traits.length) return;
  await traitsOrder(false);
}

//SELECT IF WE WANT TO SET CUSTOM NAMES FOR EVERY TRAITS OR USE FILENAMES
async function customNamesPrompt() {
  if (config.useCustomNames !== null) return;
  config.useCustomNames = 0;
}

//SET NAMES FOR EVERY TRAIT
async function setNames(trait) {
  const files = fs.readdirSync(basePath + '/' + trait);
  files.forEach((file, i) => {
    names[file] = file.split('.')[0];
  });
}

const invisibleFiles = {};

for (let k of Object.keys(pair)) {
  for (let p of Object.keys(pair[k])) {
    invisibleFiles[pair[k][p]] = true;
  }
}

//SET WEIGHTS FOR EVERY TRAIT
async function setWeights(trait) {
  if (config.weights && Object.keys(config.weights).length === Object.keys(names).length) {
    weights = config.weights;
    return;
  }
  const files = await getFilesForTrait(trait);
  const weightPrompt = [];

  let numOFValidFiles = [];

  for (let file of files) {
    if (!invisibleFiles[file]) {
      numOFValidFiles.push(file)
    }
  }

  files.forEach((file, i) => {
    let defaultWeight = parseInt(Math.round(10000 / numOFValidFiles.length));

    // weight restriction
    for (let k of Object.keys(pair)) {
      for (let p of Object.keys(pair[k])) {
        if (pair[k][p] === file) {
          defaultWeight = 0
        }
      }
    }

    weightPrompt.push({
      type: 'input',
      name: names[file] + '_weight',
      message: 'How many ' + names[file] + ' ' + trait + ' should there be?',
      default: defaultWeight,
    });
  });
  const selectedWeights = await inquirer.prompt(weightPrompt);
  files.forEach((file, i) => {
    weights[file] = selectedWeights[names[file] + '_weight'];
  });
  config.weights = weights;
}

//ASYNC FOREACH
async function asyncForEach(array, callback) {
  for (let index = 0; index < array.length; index++) {
    await callback(array[index], index, array);
  }
}

//GENERATE WEIGHTED TRAITS
async function generateWeightedTraits() {
  for (const trait of traits) {
    const traitWeights = [];
    const files = await getFilesForTrait(trait);
    files.forEach(file => {
      for (let i = 0; i < weights[file]; i++) {
        traitWeights.push(file);
      }
    });
    weightedTraits.push(traitWeights);
  }
}

//GENARATE IMAGES
async function generateImages() {
  let noMoreMatches = 0;
  let images = [];
  let id = 0;
  await generateWeightedTraits();
  if (config.deleteDuplicates) {
    while (!Object.values(weightedTraits).filter(arr => arr.length == 0).length && noMoreMatches < 20000) {
      let picked = [];
      const pickedTraits = {};
      order.forEach(id => {
        // need to update this to corresponding correct match
        // send in picked and does the filtering using memory
        let pickedImgObj = pickRandom(weightedTraits[id], traits[id], pickedTraits);
        if (pickedImgObj.num === -1) {
          picked.push(-1);
          images.push(basePath + traits[id] + '/' + pickedImgObj.image);
          pickedTraits[traits[id]] = pickedImgObj.image;
        } else {
          picked.push(pickedImgObj.num);
          let pickedImg = weightedTraits[id][pickedImgObj.num];
          images.push(basePath + traits[id] + '/' + pickedImg);
          pickedTraits[traits[id]] = pickedImg;
        }
      });

      console.log(pickedTraits);

      if (existCombination(images)) {
        noMoreMatches++;
        images = [];
      } else {
        generateMetadataObject(id, images);
        noMoreMatches = 0;
        order.forEach((id, i) => {
          if (picked[i] !== -1) {
            remove(weightedTraits[id], picked[i]);
          }
        });
        seen.push(images);
        const b64 = await mergeImages(images, { Canvas: Canvas, Image: Image });
        await ImageDataURI.outputFile(b64, outputPath + `${id}.png`);
        images = [];
        id++;
      }
    }
  }
}

//GENERATES RANDOM NUMBER BETWEEN A MAX AND A MIN VALUE
function randomNumber(min, max) {
  return Math.round(Math.random() * (max - min) + min);
}

//PICKS A RANDOM INDEX INSIDE AND ARRAY RETURNS IT
function pickRandom(array, currentTrait, pickedTraits) {
  // add restriction here to fixate the output

  // special cases
  if (currentTrait === 'cloth') { //cloth
    if (pickedTraits['exposed-cloth'] !== blank) {
      return { num: -1, image: blank }
    }

    if (pickedTraits['skin'] !== blank) { //skin
      return { num: -1, image: blank }
    }
  } else if (currentTrait === 'overheadphones-l') { //overheadphone left
    if (pickedTraits['headphones-l'] !== blank) {
      return { num: -1, image: blank }
    }
  } else if (currentTrait === 'overheadphones-r') { //overheadphone right
    if (pickedTraits['overheadphones-l'] !== blank)
      return { num: -1, image: pair.headphones[pickedTraits['overheadphones-l']] }
  } else if (currentTrait === 'hats') {
    if (pickedTraits['overheadphones-l'] !== blank) {
      return { num: -1, image: blank }
    }
  } else if (currentTrait === 'headphones-r') { //headphone right
    if (pickedTraits['headphones-l'] !== blank) {
      return { num: -1, image: pair.headphones[pickedTraits['headphones-l']] }
    }
  } else if (currentTrait === 'headphones-l') { //headphone left
    if (pickedTraits['back'] === snakeb) {
      return { num: -1, image: blank }
    }
  } else if (currentTrait === 'front') { //front
    if (pickedTraits['back'] === snakeb) {
      return { num: -1, image: pair.snake[pickedTraits['back']] }
    }
  } else if (currentTrait === 'pet') { // pet
    if (pickedTraits['back'] === snakeb) {
      return { num: -1, image: blank }
    }

    if (pickedTraits['headphones-l'] !== blank) {
      return { num: -1, image: blank }
    }
  } else if (currentTrait === 'exposed-cloth') { // exposed cloth
    if (pickedTraits['skin'] === robotb) {
      return { num: -1, image: blank }
    }
  } else if (currentTrait === 'eyes') { // eyes
    if (pickedTraits['skin'] === robotb) {
      return { num: -1, image: pair.fullbody[robotb] }
    }
  } else if (currentTrait === 'necklaces') { // necklaces
    if (pickedTraits['skin'] !== blank) {
      return { num: -1, image: blank }
    }
  } else if (currentTrait === 'fullbody') { // full body
    if (pickedTraits['skin'] !== blank) {
      return { num: -1, image: blank }
    }

    if (pickedTraits['cloth'] !== blank) {
      return { num: -1, image: blank }
    }

    if (pickedTraits['exposed-cloth'] !== blank) {
      return { num: -1, image: blank }
    }

    if (pickedTraits['necklaces'] !== blank) {
      return { num: -1, image: blank }
    }

    if (pickedTraits['hats'] !== blank) {
      return { num: -1, image: blank }
    }
  }

  return { num: randomNumber(0, array.length - 1), image: null };
}

function remove(array, toPick) {
  array.splice(toPick, 1);
}

function existCombination(contains) {
  let exists = false;
  seen.forEach(array => {
    let isEqual =
      array.length === contains.length &&
      array.every((value, index) => value === contains[index]);
    if (isEqual) exists = true;
  });
  return exists;
}

function generateMetadataObject(id, images) {
  metaData[id] = {
    name: config.metaData.name + '#' + id,
    description: config.metaData.description,
    image: config.imageUrl + id,
    attributes: [],
  };
  images.forEach((image, i) => {
    let pathArray = image.split('/');
    let fileToMap = pathArray[pathArray.length - 1];
    metaData[id].attributes.push({
      trait_type: traits[order[i]],
      value: names[fileToMap],
    });
  });
}

async function writeMetadata() {
  if (config.metaData.splitFiles) {
    let metadata_output_dir = outputPath + "metadata/"
    if (!fs.existsSync(metadata_output_dir)) {
      fs.mkdirSync(metadata_output_dir, { recursive: true });
    }
    for (var key in metaData) {
      await writeFile(metadata_output_dir + key, JSON.stringify(metaData[key]));
    }
  } else {
    await writeFile(outputPath + 'metadata.json', JSON.stringify(metaData));
  }
}

async function loadConfig() {
  try {
    const data = await readFile('config.json')
    config = JSON.parse(data.toString());
  } catch (error) { }
}

async function writeConfig() {
  await writeFile('config.json', JSON.stringify(config, null, 2));
}

async function getFilesForTrait(trait) {
  return (await readdir(basePath + '/' + trait)).filter(file => file !== '.DS_Store');
}
