'use strict'
const axios = require('axios')
const cheerio = require('cheerio')
const tarball = require('download-package-tarball')

function downloadPackages (count, callback) {
  const offsets = genMostDependedOffsets(count)
  console.log('OFFSETS: ', offsets)

  const mostDependedPromises = offsets.map(offset => getMostDependedInfo(offset))

  Promise.all(mostDependedPromises)
  .then((results) => {
    const packageNameArrays = results.map(result => extractPackageNames(result))
    console.log('PACKAGE NAME ARRAYS: ', packageNameArrays)
    const packageNames = [].concat(...packageNameArrays)
    console.log('PACKAGE NAMES: ', packageNames)
    const tarballUrls = []

    packageNames.forEach((name, index) => {
      if ( index < count) {
        tarballUrls.push(getLatestTarballUrl(name))
      }
    })
    return Promise.all(tarballUrls)
  })
  .then((urls) => {
    const tarballPromises = []
    urls.forEach((element) => {
      tarballPromises.push(getTarball(element))
    })
    return Promise.all(tarballPromises)
  })
  .then(() => {
    console.log("HERE")
    callback()
  })
}

function genMostDependedOffsets (count) {
  const numOffsets = Math.ceil(count / 36)
  console.log('NUMOFFSETS: ', numOffsets)
  const offsets = []
  for (let i = 0; i < numOffsets; i++ ) {
    console.log('I: ', i)
    offsets.push(i * 36)
  }
  return offsets
}

function getMostDependedInfo (offset) {
  return axios.get(`https://www.npmjs.com/browse/depended?offset=${offset}`)
    .then(res => res.data)
}

function getTarball (url) {
  return tarball({
    url,
    dir: './packages'
  })
}

function getLatestTarballUrl (name) {
  return axios.get(`https://registry.npmjs.org/${name}`)
    .then((res) => {
      const { 'dist-tags': currentVersions, versions  } = res.data
      return versions[currentVersions.latest].dist.tarball
    })
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
