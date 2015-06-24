require('source-map-support').install()

_     = require 'lodash'
async = require 'async'
fs    = require 'fs'
path  = require 'path'
temp  = require('temp').track()

ghostscript    = require 'ghostscript'
phantomWrapper = require 'phantom'

# Helpers
setPageSettings = (page, settingsDict, callback) ->
  settingsArray = _.pairs settingsDict

  async.mapSeries settingsArray
  , (settingPair, next) ->
    page.set settingPair[0], settingPair[1], () -> next()
  , callback

# Classes
class PDFGeneratorContentTask
  constructor: () ->
    @outputPath = temp.path { suffix: '.pdf' }

  executeOn: (page, callback) ->
    return


class PDFGeneratorURLContentTask extends PDFGeneratorContentTask
  constructor: (options) ->
    @options = options ? {}
    @url            = @options.url
    @timeout        = @options.timeout ? 25000

    @allowRedirects = @options.allowRedirects ? false
    @redirectWhitelist = @options.redirectWhitelist ? []

    @zoomFactor = @options.zoomFactor ? 1

    throw new Error "Missing url." unless @url?

    super

  waitFor: (testFn, onReady, timeOutMillis) ->
    start = new Date().getTime()
    condition = false

    interval = setInterval () ->
      if (new Date().getTime() - start) < timeOutMillis and not condition
        testFn (result) ->
          condition = result
      else
        unless condition
          onReady new Error "Timeout."
        else
          console.log "Ready"
          onReady()
          clearInterval interval
    , 100

  isReadyFn: (page) ->
    (callback) ->
      page.evaluate () ->
        engine = angular?.element ? $
        engine("#ready-state-marker").attr('ready') == 'ready'
      , callback

  shouldWaitForReady: (page, callback) ->
    page.evaluate () ->
      engine = angular?.element ? $
      engine("#ready-state-marker").length > 0
    , callback

  shouldAllowRedirect: (url) ->
    return true if @allowRedirects
    return true if url == @url
    return true if url in @redirectWhitelist

    false

  injectStyles: (page, callback) ->
    page.evaluate (zoomFactor) ->
      document.body.style.zoom = zoomFactor
    , callback, @zoomFactor

  executeOn: (page, callback) ->
    resourcesRequested = 0
    resourcesReceived  = 0

    alreadyFailed = false

    failWithError = (errorMsg) ->
      return if alreadyFailed

      alreadyFailed = true
      callback new Error errorMsg

    async.auto {
      'setup': (next, results) =>
        setPageSettings page, {
          'onConsoleMessage': (msg) ->
            console.log "Phantom Console: ", msg
          'onResourceRequested': (res) ->
            resourcesRequested += 1
          'onResourceReceived': (res) ->
            return unless res.stage == 'end'
            # Should also handle errors.
            resourcesReceived += 1
          'onUrlChanged': (newURL) =>
            return if @shouldAllowRedirect newURL

            failWithError "Disallowed redirect: <#{newURL}>."
        }, next
      'openPage': [ 'setup', (next, results) =>
        page.open @url, (status) ->
          if status != "success"
            return next new Error "Page loading failure <#{status}>."
          next()
      ]
      'allResourcesLoaded': [ 'openPage', (next, results) =>
        console.log "open"

        @waitFor ((cb) ->
          cb resourcesRequested == resourcesReceived
        ), next, @timeout
      ]
      'shouldWaitForReady': [ 'allResourcesLoaded', (next, results) =>
        console.log 'all resources loaded'

        @shouldWaitForReady page, (shouldWaitForReady) -> next null, shouldWaitForReady
      ]
      'waitForReady': [ 'shouldWaitForReady', 'allResourcesLoaded', (next, results) =>
        console.log "Should wait for ready:", results.shouldWaitForReady
        if results.shouldWaitForReady
          @waitFor @isReadyFn(page), next, @timeout
        else
          next()
      ]
      'injectStyles': [ 'waitForReady', (next, results) =>
        @injectStyles page, () -> next null
      ]
    }, (err, results) =>
      return if alreadyFailed

      return callback err if err?

      page.render @outputPath, (result) =>
        callback null, @outputPath


class PDFGeneratorMasterJob
  constructor: (@contentTasks, options) ->
    @options = options ? {}

    @headers    = @options.headers ? {}
    @cookies    = @options.cookies ? {}

    return

  execute: (callback) ->
    async.auto {
      'phantom': (next) ->
        options = {
          binary: require('phantomjs').path
          parameters:
            'local-to-remote-url-access': 'yes'
        }

        phantomWrapper.create options, (phantom) ->
          return next new Error("Could not instantiate 'phantom'.") unless phantom?
          next null, phantom
      'page': ['phantom', (next, results) ->
        results.phantom.createPage (page) ->
          return next new Error("Could not instantiate 'page'.") unless page?
          next null, page
      ]
      'setup': [ 'page', (next, results) =>
        setPageSettings results.page, {
          'dpi': 96.0
          'viewportSize': { width: '1280px', height: '800px' }
          'paperSize': { width: '595px', height: '842px', margin: '1cm' }
          'customHeaders': @headers
        }, next
      ]
      'cookies': [ 'setup', (next, results) =>
        async.eachSeries @cookies, (cookie, nextCookie) ->
          results.phantom.addCookie cookie, (result) -> nextCookie()
        , next
      ]
      'contentPDFPaths': [ 'page', 'setup', 'cookies', (next, results) =>
        return next new Error("No pages rendered.") unless @contentTasks.length > 0

        contentTaskFn = (contentTask, nextcontentTask) =>
          contentTask.executeOn results.page, nextcontentTask

        async.mapSeries @contentTasks, contentTaskFn, (err, contentResults) ->
          next err, contentResults
      ]
      'joinedPDFPath': [ 'contentPDFPaths', (next, results) ->
        return next new Error("No pages rendered.") unless results.contentPDFPaths?.length > 0
        return next null, _.first(results.contentPDFPaths) if results.contentPDFPaths?.length == 1

        inputPaths = results.contentPDFPaths.join ' '
        outputPath = temp.path { suffix: '.pdf' }

        ghostscript().batch()
        .quiet()
        .nopause()
        .device('pdfwrite')
        .input inputPaths
        .output outputPath
        .exec (err, stdout, stderr) ->
          return next err if err?

          next null, outputPath
      ]
    }, (err, results) ->
      if results.phantom?
        results.phantom.exit()

      callback err, results.joinedPDFPath


module.exports =
  PDFGeneratorContentTask:    PDFGeneratorContentTask
  PDFGeneratorURLContentTask: PDFGeneratorURLContentTask
  PDFGeneratorMasterJob:      PDFGeneratorMasterJob
