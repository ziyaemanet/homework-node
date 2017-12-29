'use strict'

const test = require('tape')
const series = require('run-series')
const fs = require('fs')
const folderSize = require('get-folder-size')
const download = require('./')

test('download', function (t) {
  t.plan(3)

  const COUNT = parseInt(process.env.COUNT, 10) || 1500

  series([
    (callback) => download(COUNT, callback),
    verifyCount,
    verifySize,
    verifyLodash
  ], t.end)

  function verifyCount (callback) {
    fs.readdir('./packages', function (err, files) {
      if (err) return callback(err)
      // Filter .gitignore and other hidden files
      console.log('FILES LENGTH IN TEST: ', files.length)
      console.log('FILES: ', JSON.stringify(files))
      files = files.filter((file) => !/^\./.test(file))
      console.log('FILES AFTER FILTER IN TEST: ', files.length)
      t.equal(files.length, COUNT, `has ${COUNT} files`)
      callback()
    })
  }

  function verifySize (callback) {
    folderSize('./packages', function (err, size) {
      if (err) return callback(err)
      t.ok(size / 1024 > 5 * COUNT, 'min 5k per package')
      callback()
    })
  }

  function verifyLodash (callback) {
    const _ = require('./packages/lodash')
    t.equal(typeof _.map, 'function', '_.map exists')
    callback()
  }
})
