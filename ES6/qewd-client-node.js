/*

 ----------------------------------------------------------------------------
 | qewd-client: Node.js Client for QEWD applications                        |
 |                                                                           |
 | Copyright (c) 2016-20 M/Gateway Developments Ltd,                         |
 | Redhill, Surrey UK.                                                       |
 | All rights reserved.                                                      |
 |                                                                           |
 | http://www.mgateway.com                                                   |
 | Email: rtweed@mgateway.com                                                |
 |                                                                                    |
 | Modified by Noel Da Costa - Converted to Node.js client
 | - removes DOM dependencies                                               |
 | http://www.arc2.co.uk                                                     |
 | Email: info@arc2.co.uk                                               |
 |                                                                           |
 | Licensed under the Apache License, Version 2.0 (the "License");           |
 | you may not use this file except in compliance with the License.          |
 | You may obtain a copy of the License at                                   |
 |                                                                           |
 |     http://www.apache.org/licenses/LICENSE-2.0                            |
 |                                                                           |
 | Unless required by applicable law or agreed to in writing, software       |
 | distributed under the License is distributed on an "AS IS" BASIS,         |
 | WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.  |
 | See the License for the specific language governing permissions and       |
 | limitations under the License.                                           |
 ----------------------------------------------------------------------------

 */

import io from 'socket.io-client';
import fetch from 'node-fetch';

let events = {};

let emitter = {
  on: function(type, callback, deleteWhenFinished) {
    if (!events[type]) events[type] = [];
    events[type].push({
      callback: callback,
      deleteWhenFinished: deleteWhenFinished
    });
  },
  off: function(type, callback) {
    let event = events[type];
    if (typeof callback === 'function') {
      if (event) {
        for (let i = 0; i < event.length; i++) {
          if (event[i].callback === callback) {
            event.splice(i,1);
          }
        }
      }
    }
    else {
      event = [];
    }
    events[type] = event;
  },
  emit: function(type, data) {
    let ev = events[type];
    if (!ev || ev.length < 1) return;
    data = data || {};
    for (let i = 0; i < ev.length; i++) {
      let e = ev[i];
      e.callback(data);
      if (e.deleteWhenFinished && data.finished) ev.splice(i,1);
    }
  },
  eventExists: function(type) {
    return (typeof events[type] !== 'undefined');
  }
};

let start = function(application, customAjaxFn, url) {

  let QEWD = this;

  function setup() {
    let cookieName = 'QEWDSession';
    let appName = application;
    let jwt = false;
    let jwt_decode;
    let log = false;
    let io_path;
    let io_transports;
    let use_fetch = false;
    let cookies = {};

    if (typeof application === 'object') {
      customAjaxFn = application.ajax;
      url = application.url;
      appName = application.application;
      cookieName = application.cookieName;
      jwt = application.jwt || false;
      jwt_decode = application.jwt_decode;
      log = application.log;
      io_path = application.io_path;
      io_transports = application.io_transports;
      use_fetch = application.use_fetch;
      application = appName;
    }

    // Simple cookie storage for Node.js
    function setCookie(name, value) {
      cookies[name] = value;
    }

    function getCookie(name) {
      return cookies[name];
    }

    (function() {

      let token;
      let socket;
    
      QEWD.application = application;

      function registerEvent(messageObj, callback) {
        let cb = callback;
        let type = messageObj.type;
        if (type === 'ewd-fragment') {
          type = type + ':' + messageObj.params.file;
          let fragmentName = messageObj.params.file;
          cb = function(responseObj) {
            // For Node.js, we just pass the content back in the callback
            // since there's no DOM to manipulate
            callback({
              fragmentName: fragmentName,
              content: responseObj.message.content
            });
          }
        }
        else if (jwt) {
          cb = function(responseObj) {
            if (responseObj.message && responseObj.message.token) token = responseObj.message.token;
            callback(responseObj);
          };
        }
        QEWD.on(type, cb, true);
      }

      function handleResponse(messageObj) {
        // messages received back from Node.js

        if (messageObj.message && messageObj.message.error && messageObj.message.disconnect) {
          if (typeof socket !== 'undefined') {
            socket.disconnect();
            console.log('Socket disconnected');
          }
          QEWD.send = function() {};
          QEWD.emit = function() {};
          console.log(messageObj.message.error);
          return;
        }
        if (messageObj.type === 'ewd-register') {
          token = messageObj.message.token;

          QEWD.setCookie = function(name) {
            name = name || 'ewd-token';
            setCookie(name, token);
          };

          QEWD.updateTokenFromJWT = function() {
            token = getCookie('JSESSIONID');
          };

          if (!QEWD.jwt) {
            Object.defineProperty(QEWD, 'jwt', {
              get: function() {
                if (jwt && jwt_decode) return jwt_decode(token);
                return false;
              }
            });
          }

          console.log(application + ' registered');
          QEWD.emit('ewd-registered');
          return;
        }

        if (messageObj.type === 'ewd-reregister') {
          if (jwt && messageObj.message.token) token = messageObj.message.token;
          console.log('Re-registered');
          QEWD.emit('ewd-reregistered');
          return;
        }

        if (QEWD.log) console.log('received: ' + JSON.stringify(messageObj));

        if (messageObj.type === 'ewd-fragment') {
           if (messageObj.message.error) {
             QEWD.emit('error', messageObj);
             return;
           }
           QEWD.emit('ewd-fragment:' + messageObj.message.fragmentName, messageObj);
           return;
        }

        if (messageObj.message && messageObj.message.error) {
          let ok = QEWD.emit('error', messageObj);
          if (ok) return;
        }

        if (jwt) {
          if (messageObj.message && !messageObj.message.error) {
            if (messageObj.message.token) {
              token = messageObj.message.token;
            }
          }
        }

        QEWD.emit(messageObj.type, messageObj);
      }

      function ajax(messageObj, callback) {
        if (callback) {
          registerEvent(messageObj, callback);
        }
        if (token) {
          messageObj.token = token;
        }
        if (token || messageObj.type === 'ewd-register') {
          messageObj.token = token;
          console.log('Ajax send: ' + JSON.stringify(messageObj));
          (function(type) {

            function success(data) {
              console.log('Ajax response for type ' + type + ': ' + JSON.stringify(data));
              if (data.ewd_response !== false) {
                handleResponse({
                  type: type,
                  message: data,
                  finished: true
                });
              }
            }

            function fail(error) {
              console.log('Error occurred: ' + error);
              let messageObj = {
                message: {error: error}
              };
              QEWD.emit('error', messageObj);
            }

            let params = {
              url: (url ? url : '') + '/ajax',
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify(messageObj),
              timeout: 10000
            };

            if (customAjaxFn) {
              customAjaxFn(params, success, fail);
            }
            else {
              fetch(params.url, {
                method: params.method,
                headers: params.headers,
                body: params.body
              })
              .then(response => response.json())
              .then(data => success(data))
              .catch(err => fail(err.message));
            }
          }(messageObj.type));
          delete messageObj.token;
          if (QEWD.log) console.log('sent: ' + JSON.stringify(messageObj));
        }
      }

      async function send_fetch(message, callback) {
        if (callback) {
          registerEvent(message, callback);
        }
        if (token || message.type === 'ewd-register') {
          message.token = token;
        }
        let fetch_url = (url ? url : '') + '/ajax';
        let options = {
          method: 'POST',
          headers: {
            'Content-type': 'application/json',
          },
          body: JSON.stringify(message)
        };
        try {
          let response = await fetch(fetch_url, options);
          let json = {
            type: message.type,
            message: await response.json(),
            finished: true
          };
          if (QEWD.log) console.log('json response: ' + JSON.stringify(json));
          handleResponse(json);
        } catch (error) {
          console.log('Fetch error: ' + error.message);
          QEWD.emit('error', { message: { error: error.message } });
        }
      }

      QEWD.send = function(messageObj, callback) {
        if (QEWD.log) console.log('send: ' + JSON.stringify(messageObj));
        if (messageObj.ajax) {
          ajax(messageObj, callback);
          return;
        }
        if (use_fetch) {
          send_fetch(messageObj, callback);
          return;
        }
        if (callback) {
          registerEvent(messageObj, callback);
        }
        if (token) {
          messageObj.token = token;
          socket.emit('ewdjs', messageObj);
          delete messageObj.token;
          if (QEWD.log) console.log('sent: ' + JSON.stringify(messageObj));
        }
      };

      let replyPromise = function(messageObj) {
        return new Promise((resolve) => {
          QEWD.send(messageObj, function(responseObj) {
            resolve(responseObj);
          });
        });
      };

      QEWD.reply = async function(message) {
        return await replyPromise(message);
      };

      QEWD.getFragment = function(params, callback) {
        QEWD.send({
          type: 'ewd-fragment',
          service: params.service || false,
          params: {
            file: params.name,
            append: params.append
          }
        }, callback);
      };

      // Initialize socket connection if not using fetch-only mode
      if (!use_fetch) {
        let options = {
          transports: io_transports || ['websocket']
        };
        
        if (io_path) {
          if (QEWD.log) console.log('Setting custom socket.io path to ' + io_path);
          options.path = io_path + '/socket.io';
        }

        socket = io(url || 'http://localhost', options);

        socket.on('connect', function() {
          console.log('Connected to QEWD server');

          QEWD.disconnectSocket = function() {
            socket.disconnect();
            console.log('QEWD disconnected socket');
          };
          
          let message;
          if (!token && cookieName && getCookie(cookieName)) token = getCookie(cookieName);

          if (token) {
            message = {
              type: 'ewd-reregister',
              token: token
            };
          }
          else {
            message = {
              type: 'ewd-register',
              application: application,
              jwt: jwt
            };
          }
          socket.emit('ewdjs', message);
        }); 

        socket.on('ewdjs', handleResponse);

        socket.on('disconnect', function() {
          console.log('*** server has disconnected socket, possibly because it shut down or because token has expired');
          QEWD.emit('socketDisconnected');
        });

        socket.on('connect_error', function(error) {
          console.log('Connection error:', error.message);
          QEWD.emit('connectionError', error);
        });
      }
      else {
        // Fetch-only mode - register immediately
        QEWD.send = ajax;
        QEWD.send({
          type: 'ewd-register',
          application: application
        });
      }

    })();

    // Clean up
    QEWD.start = function() {};
  }

  setup();
}

class QEWDClient {
  constructor() {
    this.application = 'undefined';
    this.log = false;
  }

  on(type, callback, deleteWhenFinished) {
    return emitter.on(type, callback, deleteWhenFinished);
  }

  off(type, callback) { 
    return emitter.off(type, callback);
  }

  emit(type, data) {
    return emitter.emit(type, data);
  }

  eventExists(type) {
    return emitter.eventExists(type);
  }

  start(application, customAjaxFn, url) {
    return start.call(this, application, customAjaxFn, url);
  }
}

const QEWD = new QEWDClient();
export { QEWD };