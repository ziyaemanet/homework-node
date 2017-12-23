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
  .then((results) => {
    const packageNameArrays = filterError(results).map(result => extractPackageNames(result))
    const packageNames = [].concat(...packageNameArrays)
    const tarballUrlPromises = genTarballUrlPromises(packageNames, count)
    return Promise.all(tarballUrlPromises)
  })
  .then((urls) => {
    const tarballPromises = filterError(urls).map(url => getTarball(url))
    return Promise.all(tarballPromises)
  })
  .then(() => {
    flattenScopedPackages()
    callback()
  })
  .catch(err => {
    console.log(err)
    callback()
  })
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
      tarballUrlPromises.push(getLatestTarballUrl(name))
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
  const numOffsets = Math.ceil(count / 36)
  const offsets = []
  for (let i = 0; i < numOffsets; i++ ) {
    offsets.push(i * 36)
  }
  return offsets
}

function getMostDependedInfo (offset, index) {
  const request = new Promise((resolve) => {
      setTimeout(() => {
        resolve(axios.get(`https://www.npmjs.com/browse/depended?offset=${offset}`))
      }, index * 1500)
    })
    .then(res => res.data)

  return catchError(request)
}

function getTarball (url) {
  const request = tarball({
      url,
      dir: `./packages`
    })

  return catchError(request)
}

function getLatestTarballUrl (name) {
  const request = axios.get(`https://registry.npmjs.org/${name.replace('/','%2F')}`)
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

  if (packages.length === 0) {
    console.log(new Error('NPM has return a response with no packages!'))
  }

  return packages
}

module.exports = downloadPackages
