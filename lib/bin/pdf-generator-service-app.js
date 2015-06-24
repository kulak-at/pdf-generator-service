
/*
Module dependencies.
 */
var ErrorHandler, HttpError, PDFGeneratorMasterJob, PDFGeneratorURLContentTask, _, app, bodyParser, express, path, pdfGeneratorService;

require('source-map-support').install();

_ = require('lodash');

bodyParser = require('body-parser');

express = require('express');

path = require('path');

ErrorHandler = require('error-handler');

HttpError = ErrorHandler.HttpError;


/*
Create express server.
 */

app = express();


/*
Express configuration.
 */

app.set('port', process.env.PORT || 3000);

app.use(bodyParser.json({
  limit: "1mb"
}));

app.use(bodyParser.urlencoded({
  extended: true
}));


/*
Routes.
 */

pdfGeneratorService = require('../pdf-generator-service.js');

PDFGeneratorMasterJob = pdfGeneratorService.PDFGeneratorMasterJob;

PDFGeneratorURLContentTask = pdfGeneratorService.PDFGeneratorURLContentTask;

app.post('/v1/pdf', function(req, res, next) {
  var masterJob, recipe, tasks;
  recipe = req.body;
  tasks = _.chain(recipe.tasks).map(function(taskDict) {
    if (taskDict.type = 'url') {
      return new PDFGeneratorURLContentTask(taskDict.options);
    }
  }).filter().value();
  masterJob = new PDFGeneratorMasterJob(tasks, recipe.options);
  return masterJob.execute(function(err, path) {
    if (err != null) {
      return next(err);
    }
    return res.download(path);
  });
});


/*
Catch all 404 handler.
 */

app.use('*', function(req, res, next) {
  return next(new HttpError(404, {
    message: err.message
  }));
});


/*
Error handler.
 */

app.use(function(err, req, res, next) {
  console.error(err);
  return next(new HttpError(500, {
    message: err
  }));
}, require('error-handler').handleHttpErrors);


/*
Start express server.
 */

app.listen(app.get('port'), function() {
  return console.info("Express server listening on port " + (app.get("port")) + ".");
});

module.exports = app;
