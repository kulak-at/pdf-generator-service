###
Module dependencies.
###

require('source-map-support').install()

_                = require 'lodash'
bodyParser       = require 'body-parser'
express          = require 'express'
path             = require 'path'

ErrorHandler     = require('error-handler')

###
Create express server.
###
app = express()

###
Express configuration.
###
app.set 'port', process.env.PORT or 3000

app.use bodyParser.json({ limit: "1mb" })
app.use bodyParser.urlencoded({ extended: true })

###
Routes.
###

pdfGeneratorService        = require '../pdf-generator-service.js'
PDFGeneratorMasterJob      = pdfGeneratorService.PDFGeneratorMasterJob
PDFGeneratorURLContentTask = pdfGeneratorService.PDFGeneratorURLContentTask

app.post '/v1', (req, res, next) ->
  recipe = req.body

  tasks = _.chain(recipe.tasks)
    .map (taskDict) ->
      if taskDict.type = 'url'
        return new PDFGeneratorURLContentTask taskDict.options
      return
    .filter()
    .value()

  masterJob = new PDFGeneratorMasterJob tasks, recipe.options

  masterJob.execute (err, path) ->
    return next err if err?

    res.download path


###
Catch all 404 handler.
###
app.use '*', (req, res, next) ->
  next new ErrorHandler.NotFoundError()

###
Error handler.
###
app.use (err, req, res, next) ->
  if err instanceof ErrorHandler.NotFoundError
    next new ErrorHandler.HttpError 404, message: err.message

  else if err instanceof ErrorHandler.PrivilagesError
    next new ErrorHandler.HttpError 403, message: err.message

  else if err instanceof ErrorHandler.UnauthorizedError
    next new ErrorHandler.HttpError 401, message: err.message

  else if err instanceof ErrorHandler.DbError
    next new ErrorHandler.HttpError 500, message: err.message

  else if err instanceof ErrorHandler.SError
    next new ErrorHandler.HttpError 500, message: err.message

  else if err instanceof Error
    next new ErrorHandler.HttpError 500, message: err.message

  else
    console.error err
    throw err
, require('error-handler').handleHttpErrors


###
Start express server.
###
app.listen app.get('port'), ->
  console.info "Express server listening on port #{app.get("port")}."

module.exports = app
