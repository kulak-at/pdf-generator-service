
/*
Module dependencies.
 */
var ErrorHandler, PDFGeneratorMasterJob, PDFGeneratorURLContentTask, _, app, bodyParser, express, path, pdfGeneratorService;

require('source-map-support').install();

_ = require('lodash');

bodyParser = require('body-parser');

express = require('express');

path = require('path');

ErrorHandler = require('error-handler');


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

app.post('/v1', function(req, res, next) {
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
  return next(new ErrorHandler.NotFoundError());
});


/*
Error handler.
 */

app.use(function(err, req, res, next) {
  if (err instanceof ErrorHandler.NotFoundError) {
    return next(new ErrorHandler.HttpError(404, {
      message: err.message
    }));
  } else if (err instanceof ErrorHandler.PrivilagesError) {
    return next(new ErrorHandler.HttpError(403, {
      message: err.message
    }));
  } else if (err instanceof ErrorHandler.UnauthorizedError) {
    return next(new ErrorHandler.HttpError(401, {
      message: err.message
    }));
  } else if (err instanceof ErrorHandler.DbError) {
    return next(new ErrorHandler.HttpError(500, {
      message: err.message
    }));
  } else if (err instanceof ErrorHandler.SError) {
    return next(new ErrorHandler.HttpError(500, {
      message: err.message
    }));
  } else if (err instanceof Error) {
    return next(new ErrorHandler.HttpError(500, {
      message: err.message
    }));
  } else {
    console.error(err);
    throw err;
  }
}, require('error-handler').handleHttpErrors);


/*
Start express server.
 */

app.listen(app.get('port'), "127.0.0.1", function() {
  return console.info("Express server listening on port " + (app.get("port")) + ".");
});

module.exports = app;
