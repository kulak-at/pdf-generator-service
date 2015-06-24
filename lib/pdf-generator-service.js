var PDFGeneratorContentTask, PDFGeneratorMasterJob, PDFGeneratorURLContentTask, _, async, fs, ghostscript, path, phantomWrapper, setPageSettings, temp,
  extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
  hasProp = {}.hasOwnProperty,
  indexOf = [].indexOf || function(item) { for (var i = 0, l = this.length; i < l; i++) { if (i in this && this[i] === item) return i; } return -1; };

require('source-map-support').install();

_ = require('lodash');

async = require('async');

fs = require('fs');

path = require('path');

temp = require('temp').track();

ghostscript = require('ghostscript');

phantomWrapper = require('phantom');

setPageSettings = function(page, settingsDict, callback) {
  var settingsArray;
  settingsArray = _.pairs(settingsDict);
  return async.mapSeries(settingsArray, function(settingPair, next) {
    return page.set(settingPair[0], settingPair[1], function() {
      return next();
    });
  }, callback);
};

PDFGeneratorContentTask = (function() {
  function PDFGeneratorContentTask() {
    this.outputPath = temp.path({
      suffix: '.pdf'
    });
  }

  PDFGeneratorContentTask.prototype.executeOn = function(page, callback) {};

  return PDFGeneratorContentTask;

})();

PDFGeneratorURLContentTask = (function(superClass) {
  extend(PDFGeneratorURLContentTask, superClass);

  function PDFGeneratorURLContentTask(options) {
    var ref, ref1, ref2, ref3;
    this.options = options != null ? options : {};
    this.url = this.options.url;
    this.timeout = (ref = this.options.timeout) != null ? ref : 25000;
    this.allowRedirects = (ref1 = this.options.allowRedirects) != null ? ref1 : false;
    this.redirectWhitelist = (ref2 = this.options.redirectWhitelist) != null ? ref2 : [];
    this.zoomFactor = (ref3 = this.options.zoomFactor) != null ? ref3 : 1;
    if (this.url == null) {
      throw new Error("Missing url.");
    }
    PDFGeneratorURLContentTask.__super__.constructor.apply(this, arguments);
  }

  PDFGeneratorURLContentTask.prototype.waitFor = function(testFn, onReady, timeOutMillis) {
    var condition, interval, start;
    start = new Date().getTime();
    condition = false;
    return interval = setInterval(function() {
      if ((new Date().getTime() - start) < timeOutMillis && !condition) {
        return testFn(function(result) {
          return condition = result;
        });
      } else {
        if (!condition) {
          return onReady(new Error("Timeout."));
        } else {
          console.log("Ready");
          onReady();
          return clearInterval(interval);
        }
      }
    }, 100);
  };

  PDFGeneratorURLContentTask.prototype.isReadyFn = function(page) {
    return function(callback) {
      return page.evaluate(function() {
        var engine, ref;
        engine = (ref = typeof angular !== "undefined" && angular !== null ? angular.element : void 0) != null ? ref : $;
        return engine("#ready-state-marker").attr('ready') === 'ready';
      }, callback);
    };
  };

  PDFGeneratorURLContentTask.prototype.shouldWaitForReady = function(page, callback) {
    return page.evaluate(function() {
      var engine, ref;
      engine = (ref = typeof angular !== "undefined" && angular !== null ? angular.element : void 0) != null ? ref : $;
      return engine("#ready-state-marker").length > 0;
    }, callback);
  };

  PDFGeneratorURLContentTask.prototype.shouldAllowRedirect = function(url) {
    if (this.allowRedirects) {
      return true;
    }
    if (url === this.url) {
      return true;
    }
    if (indexOf.call(this.redirectWhitelist, url) >= 0) {
      return true;
    }
    return false;
  };

  PDFGeneratorURLContentTask.prototype.injectStyles = function(page, callback) {
    return page.evaluate(function(zoomFactor) {
      return document.body.style.zoom = zoomFactor;
    }, callback, this.zoomFactor);
  };

  PDFGeneratorURLContentTask.prototype.executeOn = function(page, callback) {
    var alreadyFailed, failWithError, resourcesReceived, resourcesRequested;
    resourcesRequested = 0;
    resourcesReceived = 0;
    alreadyFailed = false;
    failWithError = function(errorMsg) {
      if (alreadyFailed) {
        return;
      }
      alreadyFailed = true;
      return callback(new Error(errorMsg));
    };
    return async.auto({
      'setup': (function(_this) {
        return function(next, results) {
          return setPageSettings(page, {
            'onConsoleMessage': function(msg) {
              return console.log("Phantom Console: ", msg);
            },
            'onResourceRequested': function(res) {
              return resourcesRequested += 1;
            },
            'onResourceReceived': function(res) {
              if (res.stage !== 'end') {
                return;
              }
              return resourcesReceived += 1;
            },
            'onUrlChanged': function(newURL) {
              if (_this.shouldAllowRedirect(newURL)) {
                return;
              }
              return failWithError("Disallowed redirect: <" + newURL + ">.");
            }
          }, next);
        };
      })(this),
      'openPage': [
        'setup', (function(_this) {
          return function(next, results) {
            return page.open(_this.url, function(status) {
              if (status !== "success") {
                return next(new Error("Page loading failure <" + status + ">."));
              }
              return next();
            });
          };
        })(this)
      ],
      'allResourcesLoaded': [
        'openPage', (function(_this) {
          return function(next, results) {
            console.log("open");
            return _this.waitFor((function(cb) {
              return cb(resourcesRequested === resourcesReceived);
            }), next, _this.timeout);
          };
        })(this)
      ],
      'shouldWaitForReady': [
        'allResourcesLoaded', (function(_this) {
          return function(next, results) {
            console.log('all resources loaded');
            return _this.shouldWaitForReady(page, function(shouldWaitForReady) {
              return next(null, shouldWaitForReady);
            });
          };
        })(this)
      ],
      'waitForReady': [
        'shouldWaitForReady', 'allResourcesLoaded', (function(_this) {
          return function(next, results) {
            console.log("Should wait for ready:", results.shouldWaitForReady);
            if (results.shouldWaitForReady) {
              return _this.waitFor(_this.isReadyFn(page), next, _this.timeout);
            } else {
              return next();
            }
          };
        })(this)
      ],
      'injectStyles': [
        'waitForReady', (function(_this) {
          return function(next, results) {
            return _this.injectStyles(page, function() {
              return next(null);
            });
          };
        })(this)
      ]
    }, (function(_this) {
      return function(err, results) {
        if (alreadyFailed) {
          return;
        }
        if (err != null) {
          return callback(err);
        }
        return page.render(_this.outputPath, function(result) {
          return callback(null, _this.outputPath);
        });
      };
    })(this));
  };

  return PDFGeneratorURLContentTask;

})(PDFGeneratorContentTask);

PDFGeneratorMasterJob = (function() {
  function PDFGeneratorMasterJob(contentTasks, options) {
    var ref, ref1;
    this.contentTasks = contentTasks;
    this.options = options != null ? options : {};
    this.headers = (ref = this.options.headers) != null ? ref : {};
    this.cookies = (ref1 = this.options.cookies) != null ? ref1 : {};
    return;
  }

  PDFGeneratorMasterJob.prototype.execute = function(callback) {
    return async.auto({
      'phantom': function(next) {
        var options;
        options = {
          binary: require('phantomjs').path,
          parameters: {
            'local-to-remote-url-access': 'yes'
          }
        };
        return phantomWrapper.create(options, function(phantom) {
          if (phantom == null) {
            return next(new Error("Could not instantiate 'phantom'."));
          }
          return next(null, phantom);
        });
      },
      'page': [
        'phantom', function(next, results) {
          return results.phantom.createPage(function(page) {
            if (page == null) {
              return next(new Error("Could not instantiate 'page'."));
            }
            return next(null, page);
          });
        }
      ],
      'setup': [
        'page', (function(_this) {
          return function(next, results) {
            return setPageSettings(results.page, {
              'dpi': 96.0,
              'viewportSize': {
                width: '1280px',
                height: '800px'
              },
              'paperSize': {
                format: "A3",
                orientation: "portrait",
                margin: '1cm'
              },
              'customHeaders': _this.headers
            }, next);
          };
        })(this)
      ],
      'cookies': [
        'setup', (function(_this) {
          return function(next, results) {
            return async.eachSeries(_this.cookies, function(cookie, nextCookie) {
              return results.phantom.addCookie(cookie, function(result) {
                return nextCookie();
              });
            }, next);
          };
        })(this)
      ],
      'contentPDFPaths': [
        'page', 'setup', 'cookies', (function(_this) {
          return function(next, results) {
            var contentTaskFn;
            if (!(_this.contentTasks.length > 0)) {
              return next(new Error("No pages rendered."));
            }
            contentTaskFn = function(contentTask, nextcontentTask) {
              return contentTask.executeOn(results.page, nextcontentTask);
            };
            return async.mapSeries(_this.contentTasks, contentTaskFn, function(err, contentResults) {
              return next(err, contentResults);
            });
          };
        })(this)
      ],
      'joinedPDFPath': [
        'contentPDFPaths', function(next, results) {
          var inputPaths, outputPath, ref, ref1;
          if (!(((ref = results.contentPDFPaths) != null ? ref.length : void 0) > 0)) {
            return next(new Error("No pages rendered."));
          }
          if (((ref1 = results.contentPDFPaths) != null ? ref1.length : void 0) === 1) {
            return next(null, _.first(results.contentPDFPaths));
          }
          inputPaths = results.contentPDFPaths.join(' ');
          outputPath = temp.path({
            suffix: '.pdf'
          });
          return ghostscript().batch().quiet().nopause().device('pdfwrite').input(inputPaths).output(outputPath).exec(function(err, stdout, stderr) {
            if (err != null) {
              return next(err);
            }
            return next(null, outputPath);
          });
        }
      ]
    }, function(err, results) {
      if (results.phantom != null) {
        results.phantom.exit();
      }
      return callback(err, results.joinedPDFPath);
    });
  };

  return PDFGeneratorMasterJob;

})();

module.exports = {
  PDFGeneratorContentTask: PDFGeneratorContentTask,
  PDFGeneratorURLContentTask: PDFGeneratorURLContentTask,
  PDFGeneratorMasterJob: PDFGeneratorMasterJob
};
