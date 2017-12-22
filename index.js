'use strict'
const axios = require('axios')
const cheerio = require('cheerio')
const tarball = require('download-package-tarball')
const fs = require('fs')
const { moveSync, removeSync } = require('fs-extra')
const { join } = require('path')


function downloadPackages (count, callback) {
  const offsets = genMostDependedOffsets(count)
  const mostDependedPromises = offsets.map(offset => getMostDependedInfo(offset))

  Promise.all(mostDependedPromises)
  .then((results) => {
    const packageNameArrays = results.map(result => extractPackageNames(result))
    const packageNames = [].concat(...packageNameArrays)
    const tarballUrls = []

    packageNames.forEach((name, index) => index < count ? tarballUrls.push(getLatestTarballUrl(name)) : '')
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
    flattenScopedPackages()
    callback()
  })
}

function flattenScopedPackages () {
  const files = fs.readdirSync('./packages')
  files.forEach((file) => {
    if (file[0] === '@') {
      const scopedPackages = fs.readdirSync(`./packages/${file}`)
      scopedPackages.forEach((scopedPackage) => moveToRootPackages(scopedPackage, file))
      removeSync(`./packages/${file}`)
    }
  })
}

function moveToRootPackages(scopedPackage, parentPackage) {
  const childDir = `./packages/${parentPackage}/${scopedPackage}`
  const files = fs.readdirSync(childDir)
  files.forEach((file) => {
    moveSync(join(childDir, file), join('./packages',`${parentPackage}-${scopedPackage}`, file), { overwrite: true })
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

function getMostDependedInfo (offset) {
  return axios.get(`https://www.npmjs.com/browse/depended?offset=${offset}`)
    .then(res => res.data)
}

function getTarball (url) {
  return tarball({
    url,
    dir: `./packages`
  })
}

function getLatestTarballUrl (name) {
  return axios.get(`https://registry.npmjs.org/${name.replace('/','%2F')}`)
    .then((res) => {
      const { 'dist-tags': currentVersions, versions  } = res.data
      return versions[currentVersions.latest].dist.tarball
    })
    .catch((err) => {
      return 'FAILED URL'
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
