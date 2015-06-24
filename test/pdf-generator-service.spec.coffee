chai = require 'chai'
sinon = require 'sinon'
# using compiled JavaScript file here to be sure module works
pdfGeneratorService        = require '../lib/pdf-generator-service.js'
PDFGeneratorMasterJob      = pdfGeneratorService.PDFGeneratorMasterJob
PDFGeneratorURLContentTask = pdfGeneratorService.PDFGeneratorURLContentTask

expect = chai.expect
chai.use require 'sinon-chai'

describe 'pdf-generator-service', ->
  it 'works with 2 google pages being stiched together', (done) ->
    task1     = new PDFGeneratorURLContentTask { url: "http://www.google.com/", allowRedirects: true }
    task2     = new PDFGeneratorURLContentTask { url: "http://www.google.de/", allowRedirects: true  }
    masterJob = new PDFGeneratorMasterJob [ task1, task2 ]

    masterJob.execute (err, result) ->
      return done err if err?

      # exec = require('child_process').exec
      # exec "open #{result}"

      done()
  it 'works for http://dev.increment.org/fonts/', (done) ->
    task      = new PDFGeneratorURLContentTask { url: "http://dev.increment.org/fonts/", allowRedirects: true, zoomFactor: 0.1 }
    masterJob = new PDFGeneratorMasterJob [ task ]

    masterJob.execute (err, result) ->
      return done err if err?

      exec = require('child_process').exec
      exec "open #{result}"

      done()
