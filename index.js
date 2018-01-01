'use strict'
const axios = require('axios')
const cheerio = require('cheerio')
const tarball = require('download-package-tarball')
const { readdirSync } = require('fs')
const { moveSync, removeSync } = require('fs-extra')
const { join } = require('path')


function downloadPackages (count, callback) {
  const offsets = genMostDependedOffsets(count)
  const mostDependedPromises = offsets.map((offset, index) => getMostDependedInfo(offset, index))

  Promise.all(mostDependedPromises)
  .then((packageNameArrays) => {
    let packageNames = [].concat(...filterError(packageNameArrays))
    packageNames = filterRepeats(packageNames)
    return Promise.all(genTarballUrlPromises(packageNames, count))
  })
  .then((urls) => {
    const tarballPromises = filterError(urls).map((url, index) => getTarball(url, index, count))
    return Promise.all(tarballPromises)
  })
  .then(() => {
    flattenScopedPackages()
    callback()
  })
  .catch(err => {
    console.log(err)
    callback(err)
  })
}

function filterRepeats (packageNames) {
  const filteredPackageNames = []
  packageNames.forEach((element) => {
    if(!filteredPackageNames.includes(element)){
      filteredPackageNames.push(element)
    }
  })
  return filteredPackageNames
}

function filterError (arr) {
  return arr.filter(element => !(element instanceof Error))
}

function catchError (promise) {
  return promise.catch((err) => {
    console.log(err)
    return err
  })
}

function genTarballUrlPromises (packageNames, count) {
  const tarballUrlPromises = []

  packageNames.forEach((name, index) => {
    if (index < count) {
      tarballUrlPromises.push(getLatestTarballUrl(name, index, count))
    }
  })

  return tarballUrlPromises
}

function flattenScopedPackages () {
  let files

  try {
    files = readdirSync('./packages')
  } catch (err) {
    files = []
    console.log(err)
  }

  files.forEach((file) => {
    if (file[0] === '@') {
      let scopedPackages

      try {
        scopedPackages = readdirSync(`./packages/${file}`)
      } catch (err) {
        scopedPackages = []
        console.log(err)
      }

      scopedPackages.forEach((scopedPackage) => moveToRootPackages(scopedPackage, file))

      try {
        removeSync(`./packages/${file}`)
      } catch (err) {
        console.log(err)
      }
    }
  })
}

function moveToRootPackages(scopedPackage, parentPackage) {
  const childDir = `./packages/${parentPackage}/${scopedPackage}`
  let files

  try {
    files = readdirSync(childDir)
  } catch (err) {
    files = []
    console.log(err)
  }

  files.forEach((file) => {
    try {
      moveSync(join(childDir, file), join('./packages',`${parentPackage}-${scopedPackage}`, file), { overwrite: true })
    } catch (err) {
      console.log(err)
    }
  })
}

function genMostDependedOffsets (count) {
  const numOffsets = Math.ceil(count / 36) + Math.ceil(count/1000)
  const offsets = []
  for (let i = 0; i < numOffsets; i++ ) {
    offsets.push(i * 36)
  }
  return offsets
}

async function doMostDependedRequest (offset) {
  let retries = 0
  const maxRetries = 10
  let packages

  while (retries < maxRetries) {
    let request
    retries += 1
    const retriesDisplay = `TRY #${retries}/${maxRetries}`
    console.log(`${retriesDisplay} ON MOST DEPENDED OFFSET: ${offset}`)

    try{
      request = await axios.get(`https://www.npmjs.com/browse/depended?offset=${offset}`)
    } catch (err) {
      console.log(err)
    }

    packages = extractPackageNames(request.data || '')

    if (packages.length === 36) {
      console.log(`SUCCESS GETTING MOST DEPENDED OFFSET ${offset} ON ${retriesDisplay}`)
      break
    } else {
      if (maxRetries === retries) {
        throw new Error(`FAILED GETTING MOST DEPENDED OFFSET: ${offset}`)
      }
      await new Promise((resolve) => {
        setTimeout(() => resolve(), retries * 5000)
      })
    }
  }

  return packages
}

function getMostDependedInfo (offset, index) {
  const request = new Promise((resolve) => {
    setTimeout(() => {
      resolve(doMostDependedRequest(offset))
    }, index * 3000)
  })

  return catchError(request)
}

// add retries?
function getTarball (url, index, count) {
  const request = new Promise((resolve) => {
    setTimeout(() => {
      console.log(`DOWNLOADING #${index + 1}/${count} @ ${url}`)
      resolve(tarball({ url, dir: `./packages`}))
    }, index * 100)
  })

  return catchError(request)
}

async function doGetLatestTarballUrlRequest(name, index, count) {
  let retries = 0
  const maxRetries = 10
  let request

  while (retries < maxRetries) {
    retries += 1
    const retriesDisplay = `TRY #${retries}/${maxRetries}`
    console.log(`${retriesDisplay} ON NPM REGISTRY INFO: ${name} #${index + 1}/${count}`)

    try{
      request = await axios.get(`https://registry.npmjs.org/${name.replace('/','%2F')}`)
    } catch (err) {
      console.log(err)
    }

    if (request instanceof Error) {
      if (maxRetries === retries) {
        throw new Error(`FAILED GETTING REGISTRY INFO: ${name} #${index + 1}/${count}`)
      }
      await new Promise((resolve) => {
        setTimeout(() => resolve(), retries * 500)
      })
    } else {
      console.log(`SUCCESS GETTING NPM REGISTRY INFO: ${name} ON ${retriesDisplay}`)
      break
    }
  }

  return request
}

function getLatestTarballUrl (name, index, count) {
    const request = new Promise((resolve) => {
      setTimeout(() => {
        resolve(doGetLatestTarballUrlRequest(name, index, count))
      }, index * 100)
    })
    .then((res) => {
      const { 'dist-tags': currentVersions, versions  } = res.data
      return versions[currentVersions.latest].dist.tarball
    })

  return catchError(request)
}

function extractPackageNames (data) {
  const $ = cheerio.load(data)
  const packages = []
  $('.name').each(function () {
    packages.push($(this).text())
  })

  return packages
}

module.exports = downloadPackages
