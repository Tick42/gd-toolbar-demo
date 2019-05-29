/* eslint-env es6 */
'use strict';

angular.module('clientContext.home', ['ngRoute'])
  .config(['$routeProvider', function ($routeProvider) {
    $routeProvider.when('/', {
      controller: 'HomeController',
      templateUrl: 'src/components/views/homeView.html'
    });
  }])
  .controller(
    'HomeController',
    ['$rootScope', '$scope', '$location', 'glueService', '$q', '$http', '$log', '$timeout', '$window',
      function ($rootScope, $scope, $location, glueService, $q, $http, $log, $timeout, $window) {

        const entityNameToEntityAndKey = {
          Client: {
            entity: null,
            key: 'name'
          },
          Instrument: {
            entity: null,
            key: 'ric'
          }
        };

        var START_BOUNDS = 'start_bounds';
        var LARGE_BOUNDS = 'large_bounds';
        var LayoutType = 'Global';

        var minimizedWindows = [];
        var localApps = [];

        var ToolBarSize = 0;
        const container = window.htmlContainer || window.glue42gd;

        $scope.isGD3 = !!window.glue42gd;

        $scope.selectedLayout = 'Default';
        $scope.searchLayout = 'Default';
        $scope.layoutType = '';
        $scope.context = '';

        $scope.userProperties = {};
        $scope.search = {
          searchAppInput: ''
        };

        $scope.favoriteApps = [];
        $scope.layouts = [];
        $scope.apps = [];

        $scope.ignoreAutoRestore = false;
        $scope.restoreAllFlag = false;
        $scope.isFavoriteView = false;
        $scope.saveAsDefault = false;
        $scope.glueInstance = false;
        $scope.showHidden = false;

        $scope.querySearchLayouts = querySearchLayouts;
        $scope.stopAndSaveLayout = stopAndSaveLayout;
        $scope.saveLayout = saveLayout;
        $scope.loadLayout = loadLayout;
        $scope.showPanel = showPanel;
        $scope.startApp = startApp;

        $scope.layoutToDelete = '';
        $scope.lastView = '';
        $scope.menu = 'app';

        $scope.gssSwimlaneWorkspaces = null;
        $scope.clients = null;
        $scope.instruments = null;
        $scope.runningApps = 0;
        $scope.favoriteAppWidth = 40;
        $scope.changeView = changeView;

        $scope.startBounds = {
          width: 452,
          height: 58,
          minWidth: 310
        };

        $scope.largeBounds = {
          width: 452,
          height: 420,
          minWidth: 410
        };

        $scope.checkboxes = {
          searchInSwimlaneWorkspaces: true,
          searchInInstruments: true,
          searchInClients: true,
          importReplace: true,
          saveOnExit: true,
        };

        $scope.themeObj = {
          all: [],
          selected: undefined
        }

        $scope.startAppWithContext = (app, applicationContext) => {
          if (!(app || applicationContext) || typeof app !== 'string') {
            return;
          }

          const appToStart = $scope.glueInstance.appManager.application(app);

          if (appToStart) {
            appToStart.start(applicationContext);
          }
        }

        function init() {
          glueService
            .then(({ glue, gss }) => {

              $scope.glueInstance = glue;
              $scope.gssInstance = new gss.GlueSearchService(glue.agm);

              $scope.gssInstance.ready()
                .then(gss => {
                  gss.onEntityTypes((error, entityTypes) => {
                    if (error) {
                      console.error('Error', error);
                      return;
                    }

                    Object
                      .keys(entityNameToEntityAndKey)
                      .forEach((entityName) => {
                        const entity = entityNameToEntityAndKey[entityName].entity;

                        if (entity) {
                          return;
                        }

                        const entityType = entityTypes.get(entityName);

                        if (typeof entityType === 'undefined') {
                          return;
                        }

                        entityNameToEntityAndKey[entityName].entity = entityType;
                      });
                  });
                })
                .catch(console.error);

              window.gssInstance = $scope.gssInstance;

              glue.agm.register('T42GSS.GetSwimlaneWorkspaces', () => getSwimlaneLayouts());

              internalInit();
              registerLayouts();
              registerHotkeys();
            })
            .catch(console.error);
        }

        init();

        function filterApps() {
          let swimlaneLayouts = getSwimlaneLayouts();

          localApps = $scope.glueInstance.appManager
            .applications()
            .concat(swimlaneLayouts.map(swimlaneLayout => {
              return {
                title: swimlaneLayout.name,
                type: 'swimlane'
              }
            }))
            .filter((app) => {
              if (app.configuration && app.configuration.hidden && !$scope.showHidden) {
                return false;
              }

              if ($scope.glueInstance.appManager.myInstance && $scope.glueInstance.appManager.myInstance.application.name === app.name) {
                return false;
              }

              return true;
            })
            .sort((a, b) => {
              let orderA = a.userProperties && a.userProperties.appManagerOrder;
              let orderB = b.userProperties && b.userProperties.appManagerOrder;

              if (orderA !== orderB) {
                if (!orderA) {
                  return 1;
                }

                if (!orderB) {
                  return -1;
                }

                return orderA - orderB;
              } else {
                const titleA = a.title.toUpperCase();
                const titleB = b.title.toUpperCase();

                if (titleA < titleB) {
                  return -1;
                }
                if (titleA > titleB) {
                  return 1;
                }

                return 0;
              }
            });

          localApps.forEach(app => $scope.userProperties[app.name] = app.userProperties && app.userProperties.functions);

          $scope.filterAppsByName();
          $scope.updateRunningApps();

          $scope.apps = filterApplicationsNames(localApps); // FIXED: DEMO_D-624 all the apps are displayed when a Client/Instrument application is started
        }

        function getSwimlaneLayouts() {
          if (container && container.canvas) {
            let canvasLayouts = [];

            if (!$scope.$$phase) {
              $scope.$apply(() => {
                canvasLayouts = container.canvas.getLayouts();

                canvasLayouts.forEach((canvasLayout) => {
                  const isAlreadyAdded = !!$scope.layouts.find(layout => layout.name === canvasLayout.name);

                  if (!isAlreadyAdded) {
                    $scope.layouts.push(canvasLayout);
                  }
                });

                console.log('Layouts:', $scope.layouts);
              });
            }

            return canvasLayouts;
          }

          return [];
        }

        function minimizeAll() {
          return $scope.glueInstance.windows.list().filter(function (w) {
            if ($scope.glueInstance.windows.my().id === w.id) {
              return false;
            }
            if (w.state !== 'minimized' && w.isVisible) {
              console.log('Minimizing: ' + w.name + ' state: ' + w.state);
              w.minimize();
              return true;
            }
            return false;
          })
        }

        function restoreAll() {
          minimizedWindows.forEach(function (w) {
            if (w.state !== 'normal' && w.isVisible) {
              console.log('Restoring: ' + w.name + ' state: ' + w.state);
              w.restore();

            }
          })
        }

        function startApp(app, event) {

          // This will cause to remove search string and show all apps

          let appToStart = app;
          $scope.search.searchAppInput = '';
          $scope.filterAppsByName();

          if (app && app.type === 'swimlane') {
            loadSwimlaneLayout(app.title);
            return;
          }


          if (typeof app === 'string') {
            appToStart = $scope.glueInstance.appManager.application(app);
          }

          if (!appToStart) {
            $log.info(app + ' is not defined');
            return;
          }

          let allowMultipleInstances = typeof appToStart.allowMultiple === "boolean" ? appToStart.allowMultiple : true;

          if (!allowMultipleInstances && appToStart.instances.length > 0) {
            var singleInstance = appToStart.instances[0];
            singleInstance.window.setVisible(true);
            singleInstance.window.activate();

          } else {
            appToStart.start();
          }

          if (event && !event.ctrlKey) {
            $scope.changeView('app');
          }


          $log.info(app.name + ' has started');
        }

        function showPanel(event) {
          event.stopPropagation();
          $scope.glueInstance.agm.invoke('T42.Notifications.Show')
            .then(() => $log.info('Showing notification panel.'))
            .catch((err) => $log.error(`Failed to show Notifications panel: ${err}`));
        }

        function registerLayouts() {
          $scope.layouts = getSwimlaneLayouts().map(swimlaneLayout => {
            return {
              name: swimlaneLayout.name,
              type: 'swimlane',
              icon: '',
              direction: 'right'
            }
          });
          $scope.glueInstance.layouts.onAdded(function (layout) {
            $log.info('Layout onAdded', layout);
            if (layout.type !== LayoutType) {
              return;
            }
            var layoutToAdd = {
              name: layout.name,
              type: layout.type,
              context: layout.context,
              components: layout.components,
              icon: '',
              direction: 'right'
            };

            $log.info('Layout added: ', layoutToAdd);
            $scope.layouts.push(layoutToAdd);

          });

          $scope.glueInstance.layouts.onChanged(function (layout) {
            if (layout.type !== LayoutType) {
              return;
            }
            // remove existing
            var newArray = $scope.layouts.filter(function (l) {
              return l.name !== layout.name;
            });
            newArray.push({
              name: layout.name,
              type: layout.type,
              context: layout.context,
              components: layout.components,
              icon: '',
              direction: 'right'
            });

            $scope.layouts = newArray;

          });

          $scope.glueInstance.layouts.onRemoved(function (layout) {
            $log.info('Layout onRemoved', layout);
            if (layout.type === LayoutType) {
              $scope.$apply(function () {
                var newArray = $scope.layouts.filter(function (l) {
                  return l.name !== layout.name;
                });
                $scope.layouts = newArray;
              })

            }
          });
        }

        function registerHotkeys() {
          if (glue && glue.hotkeys) {
            glue.hotkeys.register('ctrl+shift+a', (info) => {
              console.log('hotkey pressed');
              glue.windows.my().focus();
            }).then(() => {
              console.log('Hotkey registered');
            }).catch(err => {
              console.warn('Could not register hotkey', err);
            })
          }
        }

        function base64ToArrayBuffer(base64) {
          var binaryString = window.atob(base64);
          var binaryLen = binaryString.length;
          var bytes = new Uint8Array(binaryLen);
          for (var i = 0; i < binaryLen; i++) {
            var ascii = binaryString.charCodeAt(i);
            bytes[i] = ascii;
          }
          return bytes;
        }

        function saveAsFile(blob, name) {
          var a = document.createElement("a");
          document.body.appendChild(a);
          a.style = "display: none";
          var url = window.URL.createObjectURL(blob);
          a.href = url;
          a.download = name;
          a.click();
          window.URL.revokeObjectURL(url);
        }

        function debounce(func, wait, immediate) {
          var timeout;
          return function () {
            var context = this, args = arguments;
            var later = function () {
              timeout = null;
              if (!immediate) func.apply(context, args);
            };
            var callNow = immediate && !timeout;
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
            if (callNow) func.apply(context, args);
          };
        }

        function fileHelper(file) {
          const reader = new FileReader();
          reader.addEventListener('load', () => {
            const text = reader.result;
            if (text) {
              var mode = $scope.checkboxes.importReplace ? "replace" : "merge";
              $scope.glueInstance.layouts.import(JSON.parse(text), mode)
                .then(() => {
                  //clear input
                  document.getElementById("fileInput").value = "";
                })
                .catch(console.error);
            }
          }, false);
          if (file) {
            reader.readAsText(file);
          }
        }

        function stopAndSaveLayout() {
          localStorage.setItem('saveOnExit', $scope.checkboxes.saveOnExit);
          localStorage.setItem('show-getting-started', $scope.checkboxes.showGettingStarted);
          $scope.ignoreAutoRestore = true;
          console.log('exiting. save - ', $scope.checkboxes.saveOnExit);
          $scope.glueInstance.appManager.exit({
            autoSave: $scope.checkboxes.saveOnExit
          });
          return;
        }

        function querySearchLayouts(query) {
          var results = $scope.layouts.filter(createFilterFor(query))
          return results;
        }

        function createFilterFor(query) {
          var lowercaseQuery = angular.lowercase(query);

          return function filterFn(layout) {
            return (angular.lowercase(layout.name).indexOf(lowercaseQuery) === 0);
          };
        }

        function changeView(view, event) {

          if (view === 'settings') {
            console.log(view);
            $scope.glue42gdSettings = {
              user: window.glue42gd.user,
              version: window.glue42gd.version,
              gw: window.glue42gd.gwURL,
            }
          }

          if (event && event.altKey && view === 'app') {
            $scope.showHidden = !$scope.showHidden;
            filterApps();
          } else {
            if ($scope.lastView === view) {
              changeWindowSize($scope.startBounds);
              $scope.currentBounds = START_BOUNDS;
              $scope.lastView = '';
            } else {
              changeWindowSize($scope.largeBounds);
              $scope.currentBounds = LARGE_BOUNDS;
              $scope.lastView = view;
              if (view === 'app') {
                setTimeout(() => {
                  let input = $('.searchInput input')[0];
                  input && input.focus && input.focus();
                }, 0);
              }
            }

            $scope.menu = view;
          }
        }

        function changeWindowSize(sizes, cb) {
          var myWin = $scope.glueInstance.windows.my();
          myWin.moveResize({
            height: sizes.height,
            width: sizes.width
          }, cb);
        }

        function saveLayout(name, cb) {
          const layoutName = name || $('input[name="autocompleteFieldSaveLayout"]').val();

          $scope.defaultLayout = layoutName;

          $scope.glueInstance.windows.my().showLoader({ text: 'Saving layout...' });

          const layoutConfig = {
            name: layoutName,
            ignoreMyInstance: true,
            context: { defaultDate: Date() }
          };

          $scope.glueInstance.layouts
            .save(layoutConfig)
            .then((resp) => {
              console.log('Saving layout response:', resp)
              $log.info('Layout was saved:', layoutName);

              $scope.searchLayout = layoutName;
              $scope.selectedLayout = layoutName;
              $scope.lastView = '';

              if (typeof cb === 'function') {
                cb();
              }

              setTimeout(() => {
                $scope.glueInstance.windows.my().hideLoader();

                changeWindowSize($scope.startBounds);

                $scope.currentBounds = START_BOUNDS;
              }, 500);
            })
            .catch(err => {
              console.log('Error saving layout:', err);
              $scope.glueInstance.windows.my().hideLoader();
            });
        }

        function loadLayout(layout, callback) {
          if ((layout.type !== 'Global' && layout.type !== 'Activity') || layout.type === 'swimlane') {
            loadSwimlaneLayout(layout.name);
            return;
          }

          const name = layout.name;
          $scope.defaultLayout = name;

          $scope.glueInstance.windows.my().showLoader({ text: 'Restoring layout...' });

          setTimeout(() => {
            changeWindowSize($scope.startBounds)
            $scope.currentBounds = START_BOUNDS;
          }, 500);

          const layoutConfig = {
            name: name,
            closeOwnRunning: true,
            closeHidden: false,
            closeAllRunning: true
          };

          $scope.glueInstance.layouts
            .restore(layoutConfig)
            .then((resp) => {
              console.log('Restoring layout response: ', resp);
              $log.info('Layout was restored:', name);

              $scope.lastView = '';

              $scope.$apply(() => {
                $scope.selectedLayout = name;
                $scope.searchLayout = name;

                if (callback) {
                  callback();
                }

                $scope.glueInstance.windows.my().hideLoader();
              });
            })
            .catch(err => {
              console.log('Error loading layout:', err);
              $scope.glueInstance.windows.my().hideLoader();
            });
        }

        function loadSwimlaneLayout(swimlaneLayoutName) {
          container.canvas.openWorkspace(swimlaneLayoutName);
        }

        function internalInit() {
          /** resilient sub */
          const COUNTER_STREAM_NAME = "T42.Notifications.Counter";

          let sub = null

          const subscribeForResults = () => {
            $scope.glueInstance.agm.subscribe(
              COUNTER_STREAM_NAME, {
                target: 'all',
                waitTimeoutMs: 10000
              })
              .then(function (subscription) {
                sub = subscription;

                console.log(`Subscribed successfully to ${COUNTER_STREAM_NAME}`)

                subscription.onData(function (streamData) {
                  console.log("counter stream data", streamData)
                  $scope.$applyAsync(function () {
                    $scope.notificationCount = streamData.data.count;
                  });
                })
              })
              .catch(function (error) {
                console.log(`Failed to subscribe for ${COUNTER_STREAM_NAME}`, error)
              });
          }

          $scope.glueInstance.agm.methodAdded((method) => {
            if (method.name !== COUNTER_STREAM_NAME) {
              return;
            }

            if (sub) {
              sub.close();
            }
            subscribeForResults();
          });

          $scope.glueInstance.windows.my().onBoundsChanged((win) => {
            $scope.startBounds.width = win.bounds.width;
            $scope.largeBounds.width = win.bounds.width;
          })

          filterApps();
          $scope.apps = localApps;
          $scope.favoriteApps = localStorage.getItem('favorites') !== null ? JSON.parse(localStorage.getItem('favorites')).map((a) => $scope.glueInstance.appManager.application(a)).filter((a) => !a.hidden || $scope.showHidden) : [];
          $scope.favoriteApps.forEach((app) => {
            var app = $scope.apps.find((a) => a.name === app.name);
            if (app) {
              app.favorite = true;
            }
          })

          $scope.$watch('currentBounds', (newValue) => {
            document.body.setAttribute('bounds', newValue);
          })

          $scope.glueInstance.windows.my().hideLoader();
          var newWidth = $scope.favoriteApps.length * $scope.favoriteAppWidth;
          $scope.startBounds.width += newWidth;
          $scope.largeBounds.width += newWidth;
          $scope.largeBounds.minWidth += newWidth;

          changeWindowSize($scope.startBounds);
          $scope.currentBounds = START_BOUNDS;

          $scope.glueInstance.windows.my().onFocusChanged(function (win) {
            var body = angular.element(document.querySelector('body'));
            var color = win.isFocused ? '#3333cc' : '#485d60';
            body.css('border-color', color);
          });

          var saveOnExitCheckBox = localStorage.getItem('saveOnExit') || false;
          var showGettingStarted = localStorage.getItem('show-getting-started') || true;
          if (showGettingStarted !== 'true' && showGettingStarted !== 'false') {
            showGettingStarted = 'true';
          }

          $scope.checkboxes.saveOnExit = saveOnExitCheckBox ? JSON.parse(saveOnExitCheckBox) : true;
          $scope.checkboxes.showGettingStarted = showGettingStarted ? JSON.parse(showGettingStarted) : true;
          $scope.defaultIcon = 'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAAA39pVFh0WE1MOmNvbS5hZG9iZS54bXAAAAAAADw/eHBhY2tldCBiZWdpbj0i77u/IiBpZD0iVzVNME1wQ2VoaUh6cmVTek5UY3prYzlkIj8+IDx4OnhtcG1ldGEgeG1sbnM6eD0iYWRvYmU6bnM6bWV0YS8iIHg6eG1wdGs9IkFkb2JlIFhNUCBDb3JlIDUuNi1jMTQyIDc5LjE2MDkyNCwgMjAxNy8wNy8xMy0wMTowNjozOSAgICAgICAgIj4gPHJkZjpSREYgeG1sbnM6cmRmPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5LzAyLzIyLXJkZi1zeW50YXgtbnMjIj4gPHJkZjpEZXNjcmlwdGlvbiByZGY6YWJvdXQ9IiIgeG1sbnM6eG1wTU09Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC9tbS8iIHhtbG5zOnN0UmVmPSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvc1R5cGUvUmVzb3VyY2VSZWYjIiB4bWxuczp4bXA9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC8iIHhtcE1NOk9yaWdpbmFsRG9jdW1lbnRJRD0ieG1wLmRpZDphNjdlY2VjNS0wZjIwLTNjNDgtODg0Ni1kZDkwOWU1Mjg0MGYiIHhtcE1NOkRvY3VtZW50SUQ9InhtcC5kaWQ6MTA5RkY0NjMwMUFFMTFFODk3Q0RGQ0RFNEJFMjNDQ0QiIHhtcE1NOkluc3RhbmNlSUQ9InhtcC5paWQ6MTA5RkY0NjIwMUFFMTFFODk3Q0RGQ0RFNEJFMjNDQ0QiIHhtcDpDcmVhdG9yVG9vbD0iQWRvYmUgUGhvdG9zaG9wIENDIChXaW5kb3dzKSI+IDx4bXBNTTpEZXJpdmVkRnJvbSBzdFJlZjppbnN0YW5jZUlEPSJ4bXAuaWlkOjc3MDAxYWEyLTVhMjAtMDI0Mi1iNDcyLTQ3NDM2NjhjYzMyZiIgc3RSZWY6ZG9jdW1lbnRJRD0iYWRvYmU6ZG9jaWQ6cGhvdG9zaG9wOjViM2MwM2YwLTgyYjMtMzk0OS1hOWJhLTkxNTY0MWM2YTUwMCIvPiA8L3JkZjpEZXNjcmlwdGlvbj4gPC9yZGY6UkRGPiA8L3g6eG1wbWV0YT4gPD94cGFja2V0IGVuZD0iciI/PnGnHRIAAAJKSURBVHja7JvBbcIwFIaTqgu4I9Aj3MKp9EgnqMIIdIFKMAJIXQBGaNQJmmNRL80NrhmBjJA+S8/Vk+VAEmEaKf+TLJPEjv0+/89+CBGWZRn02W6CnlvvAdz6HuD5LfuiakJl9/EaPfrq02UFTKzaVx+EAAAAAAAAAAAAAAAAwL+kwk3T166kyJdUQNP0tRMpMvYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGhjO6s+Z99W7WOMs3axn8aa/lRF7R98j4EQAAAAAAAA6ACANkfXxY+7KgvxfwGEQL+tVSY4Go1WVC34MjscDmNXu+FwGFGl207F7YzKmvok3EbG4MzcF+84UqX48oWeb/n+nKqNY9h8v9/f+1ZALD5HNBnlcF47/cPOF6JEwqFT7zXvUDXmU1jFnwJo9fWkBjxQypPWalhaTd+5TmnVnqRTdJ06HAgspWibi+eVIGjF7665B5hJpVxcKzcXE57JZw7nA26rQ0NRX/kuo56sS5ugWaWEyG95ggOW619YmHgkh+tKMpEwBcS0hipLUTbeANDLzaQKcj4RSpDKaGW8uRUCsFHCukt7gHFSadoVygiEZLUyVAMV6H5TDoOIFZTR9clOV9kDyGElpO0iruN3Yck5qDiqzoXBipWWdCkPMM4VkngYhjpeP1kBMZ/xBd1bc5+Yz3K54Y31yrrCgNpu+JTRtq25OEcrDxj72ANiS96ulYs4+dHOLPkEyNlpU/IzcZqKBCuvOTdlFXwZwncBAKhnvwIMAJRG1WWvKkoMAAAAAElFTkSuQmCC';
          $scope.swimlaneIcon = 'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAMAAACdt4HsAAABwlBMVEUAAADR2ifR2ifR2idpbhQBAQECAgIDAwMEBAQFBQUGBgYHBwcICAgJCQkKCgoLCwsMDAwNDQ0ODg4PDw8QEBARERESEhITExMUFBQVFRUWFhYXFxcYGBgZGRl1eiAlJRodHh4hISI7Oz1xc3U0NTYqKyxpamxSU1RYWVt5e301NTYqKis6Ozw1NjZSU1VXWVo2NjcpKipQUVMnKChQUVJkZmg9PT83ODlSVFU6Ojw8PT4nJyhaW104OTlTVFUoKCltbnA2Nzg4OTo5OjsmJyhydGt/gXg3ODhTVFYmJidgYVi6wjHByDc5OTpTVVYlJidUVVY5OTslJSYbGxyChIdjZGZ6e36yuEnAxVajo6SXl5iEhIUuLi6QkpVcXmAiIyOIiYyUl47FzTzQ10bMzMHMy8vAv780NDSHhoZaWlpdXmCIioxaWVkjJCQzMzOGhoZZWVkkJCUyMjJdX2CrrKKGhYVZWFhdX2EkJSWnp6lYWFiFhYWUlphrbG47PD1eX2GEg4PBwMFfYWNYV1e1tLWIio1gYWOampsxMTGTk5VXV1c8PD6ur7AwMDAmJyefoKMnJydXVlaio6QvLy+XmJokJRqDxlKzAAAAA3RSTlMAUN9WoVbPAAACn0lEQVRYw+2X51MTQRiHL0QIBEJyCSGBBAso3EmxREWDiBIbKvYW9cR2sfdesaEoYMTy//q+v70jfjCXKzPMOJP9kHm/PE92bn+7764k+Wr8rkeNT5J87nEePsnD/2MOEv0sqa2rCwQC9fUNDcFgsLGxqSkUCjU3h8ORSESWo9FoLNbSEo/HW1sTiWQy2dbW3p5KpdLpjqUEs6DWrWCZV0FHVVAVLIJgeUmwwo2gs2ulKVjV3eNc0Kl0qauFoFfpVnucCvoUEqj9LOhVSKAOOBMQzwK1X5aJZwEZHAiYV9YQpa5dx+V6LgfsC8BnwhsY20jlptggl5vtCraApxwYhizlQBjsCcAPIUhbMXUEaZjLbXYEgkcSR5TtjO1AEkdhqCzIMb8TUR6hatduwvYgyjDsrSQAP4YoM79v/wEYEOVxYbAUCB5RzoD3+2EYRJRhOGglAH8IUTZ504Ao59hwuLzgCHhEeWiBNwzDiLIwlBOMM38UUf6bNwyjiLJh+Kfg2HEaJxDl+EkqT5Va6Ol8Pn8mjSifpTJ/rswMNBrnMYOJC5p28ZLJX76i64WrmME1ncb1ct8gx4Yb+AYTN0sGg2cB+FsWqwADVuH2ggH8HayC4C1zIAycA9MgeOTgLvP3rJPYBwOSeB8G8A+QRMFX2gswPMRegOER89gLj5l/Unk3wvAUu/EZGbTnxLMA/As754Ew4Dx4+YrK1zgPBG/vRHrDhkkSvNXfseE9CcB/sHsmCgPxuv5xispPMcHbP5Vh+ExMYXqMDV+Y/+qkL8wQNUv8nCx/I0OReWedaYYFhTnuTGQoMu+wN2a1WeLRG79PFfV55905++On2Z0zv+bd3A8SpftB6j+94lQFVcEiC9w+PH/j4en56ev58e31+f8Ht0Nyh3dbvqsAAAAASUVORK5CYII=';

          const debouncedAction = debounce(function refresh(cb) {
            filterApps();
            $scope.$apply();
          }, 100)

          $scope.glueInstance.appManager.onAppAdded(debouncedAction);
          $scope.glueInstance.appManager.onAppRemoved(debouncedAction);
          $scope.glueInstance.appManager.onInstanceStarted(debouncedAction);
          $scope.glueInstance.appManager.onInstanceStopped(debouncedAction);
          $scope.glueInstance.contexts.subscribe("Connect.Themes", (themeObj) => {
            /*
                Adding a Colorful theme to display in the dropdown
             */
            // if (!themeObj.all.find(t => t.name === 'colorful')) {
            //     themeObj.all.push({name: 'colorful', displayName: 'Colorful'});
            //     $scope.glueInstance.contexts.update('Connect.Themes', themeObj);
            // }

            /*
                Removing the Colorful theme
            */
            let withoutColorFulTheme = themeObj.all.filter(theme => {
              return theme.name !== 'colorful';
            });

            if (themeObj.all.length !== withoutColorFulTheme.length) {
              themeObj.all = withoutColorFulTheme;
              $scope.glueInstance.contexts.update('Connect.Themes', themeObj);
            }

            $scope.themeObj.all = themeObj.all;
            $scope.themeObj.selected = themeObj.selected;
            $scope.$apply();
            document.body.parentElement.classList.remove(...$scope.themeObj.all.map(t => t.name))
            document.body.parentElement.classList.add($scope.themeObj.selected);
          });
          container.canvas && container.canvas.subscribeLayoutEvents(debouncedAction);

          let gettingStartedApp = $scope.glueInstance.appManager.application('getting-started');
          if ($scope.checkboxes.showGettingStarted && gettingStartedApp) {
            gettingStartedApp.start();
          }
        }

        function getEntities(entityName, input) {
          if (entityNameToEntityAndKey[entityName].entity === null) {
            return;
          }

          return new Promise((resolve, reject) => {
            if (!$scope.gssInstance) {
              reject('No GSS in "getClients"');
            }

            let searchFields = [];

            if (entityName === 'Client') {
              searchFields = [
                { name: 'name.value', value: $scope.search.searchAppInput },
                { name: 'email.value', value: $scope.search.searchAppInput },
                { name: 'id.value', value: $scope.search.searchAppInput }
              ];
            } else {
              searchFields = [{ name: 'ric', value: $scope.search.searchAppInput }];
            }

            const query = $scope.gssInstance.createQuery(entityName, {});

            if (!query) {
              reject('No GSS query or key in "getClients"');
            }

            query
              .onData(({ entities }) => {
                const entityToResolveWith = {
                  type: entityName,
                  entities,
                };

                resolve(entityToResolveWith);

                query.clearCallbacks();
              })
              .search(...searchFields)
          });
        }

        function availableApplications(entityName) {
          if (!$scope.glueInstance) {
            console.log('No Glue instance in "getAvailableApplications"');
            return [];
          }

          return $scope.glueInstance.appManager
            .applications()
            .filter(app => {
              if (typeof app.userProperties.consumes !== 'undefined') {
                return app.userProperties.consumes.includes(entityName);
              }
            });
        }

        function getClientData(clientId) {
          return new Promise((resolve, reject) => {
            $http({
              method: 'GET',
              url: 'http://localhost:22060/clients/' + clientId,
            })
              .then(resolve, reject);
          });
        }

        function getClientsSwimlaneLayouts() {
          const modifiedLayouts = glue42gd.canvas
            .exportLayouts()
            .reduce((currentModifiedLayouts, currentCanvas) => {

              const layouts = currentCanvas.canvas.lanes
                .reduce((accApps, currentLane) => {
                  const swimlaneLayoutsApps = currentLane.items.map(item => item.items.map(app => app.name)[0]);

                  accApps.push.apply(accApps, swimlaneLayoutsApps)
                  return accApps;
                }, []);

              const isClientWorkspace = layouts.indexOf('client-view') >= 0;

              if (isClientWorkspace) {
                const modifiedLayout = {
                  name: currentCanvas.name,
                  layouts
                };

                currentModifiedLayouts.push(modifiedLayout);
              }

              return currentModifiedLayouts;
            }, []);

          return modifiedLayouts;
        }

        $scope.openClientSwimlane = (swimlaneName, clientId) => {
          getClientData(clientId)
            .then(({ data }) => glue42gd.canvas.openWorkspace(swimlaneName, { context: { party: data } }))
            .catch(console.error);
        }

        $scope.filter = function () {
          $scope.swimlaneLayouts = getClientsSwimlaneLayouts();

          $scope.filterAppsByName();

          if ($scope.checkboxes.searchInInstruments && entityNameToEntityAndKey['Instrument'].entity !== null && glue42gd) {
            $scope.availableApplicationsForInstruments = availableApplications('Instrument');

            getEntities('Instrument')
              .then(({ entities }) => $scope.$apply(() => $scope.instruments = entities))
              .catch(console.error);
          }

          if ($scope.checkboxes.searchInClients && entityNameToEntityAndKey['Client'].entity !== null && glue42gd) {
            $scope.availableApplicationsForClients = availableApplications('Client');

            getEntities('Client')
              .then(({ entities }) => $scope.$apply(() => $scope.clients = entities))
              .catch(console.error);
          }
        }

        $window.onbeforeunload = function (evt) {
          if ($scope.glueInstance) {
            console.log('Saving favorites ....');
            localStorage.setItem('favorites', angular.toJson($scope.favoriteApps.map((a) => a.name)));
          }
        }

        $scope.filterAppsByName = function (appsToFilter) {
          console.log('called filter apps by name with:', appsToFilter);
          if (appsToFilter) {
            $scope.apps = localApps.filter(localApp => {
              var favoriteAppsNames = $scope.favoriteApps.map(favoriteApp => favoriteApp.name);

              return favoriteAppsNames.indexOf(localApp.name) >= 0;
            });

            return;
          }

          appsToFilter = [];

          if ($scope.isFavoriteView) {
            appsToFilter = $scope.favoriteApps;
          } else {
            appsToFilter = localApps;
          }

          if (typeof $scope.search.searchAppInput === 'undefined') {
            return;
          }

          $scope.apps = filterApplicationsNames(appsToFilter);
        }

        function filterApplicationsNames(appsToFilter) {
          return appsToFilter.filter(app => {
            const appTitle = app.title.toLowerCase();
            const searchAppInput = $scope.search.searchAppInput.toLowerCase();

            const matchedAppTitle = appTitle.indexOf(searchAppInput) >= 0;

            if (matchedAppTitle) {
              return true;
            }

            if (!(app.userProperties && app.userProperties.functions)) {
              return false;
            }

            const matchedFunctionsList = app.userProperties.functions
              .map(func => func.key.toLowerCase())
              .filter(functionKey => functionKey.indexOf(searchAppInput) >= 0);

            const matchedSearch = matchedFunctionsList.length > 0;

            return matchedSearch;
          });
        }

        $scope.addToFavorite = function (app, event) {
          var index = $scope.favoriteApps.map(function (e) {
            return e.name;
          }).indexOf(app.name);
          if (index === -1) {
            app.favorite = true;
            $scope.favoriteApps.push(app);
          } else {
            app.favorite = false;
            $scope.favoriteApps.splice(index, 1);
          }
        }

        $scope.showFavorites = function (event) {
          if (event.currentTarget.classList.toggle('favorite-selected')) {
            $scope.isFavoriteView = true;
            $scope.filterAppsByName($scope.favoriteApps);
          } else {
            $scope.search.searchAppInput = '';
            $scope.isFavoriteView = false;
            $scope.filterAppsByName();
          }
        }

        $scope.activeInstance = function (instance) {
          if (instance.window && instance.window.state === 'minimized') {
            instance.window.restore();
          }
          instance.activate();
        }

        $scope.layoutSearchChange = function (layout) {
          $log.info('layoutSearchChange:', layout);
          $scope.layoutType = layout;
        }

        $scope.selectedLayoutChange = function (layout) {
          if (layout !== undefined) {
            $log.info('selectedLayoutChange:', layout.name);
            $scope.selectedLayout = layout.name;
          }
        }

        $scope.toggleSaveAsDefault = function () {
          $scope.saveAsDefault = !$scope.saveAsDefault;
        }

        $scope.hide = function () {
          $('#divtoshow').hide();
        }

        $scope.deleteLayout = function () {
          if ($scope.layoutToDelete.name === $scope.defaultLayout) { }
          $scope.glueInstance.layouts.remove(LayoutType, $scope.layoutToDelete.name)
          $log.info('Layout was deleted: ', $scope.layoutToDelete);
        }

        $scope.showMenu = function (event, layout) {
          $scope.layoutToDelete = layout;

          var x = event.clientX,
            y = event.clientY,
            menuHeight = 40,
            menuWidth = 160;
          x = (x < window.outerWidth - menuWidth) ? x : window.outerWidth - menuWidth;
          y = (y < window.outerHeight - menuHeight) ? y : window.outerHeight - menuHeight;

          $('#divtoshow').css({ top: y, left: x }).show();
        }

        $scope.restoreAll = function () {
          $scope.restoreAllFlag = false;
          restoreAll();
        }

        $scope.minimizeAll = function () {
          $scope.restoreAllFlag = true;
          minimizedWindows = minimizeAll();
        }

        $scope.exportAll = function () {
          $scope.glueInstance.layouts.export()
            .then((layouts) => {
              var blob = new Blob([JSON.stringify(layouts, null, 2)], {
                type: 'application/json'
              });
              var sampleBytes = base64ToArrayBuffer('R0lGODlhAQABAIAAAAUEBAAAACwAAAAAAQABAAACAkQBADs');
              saveAsFile(blob, 'layouts.json');
            })
            .catch((e) => {
              console.error(e);
            })
        }

        $scope.importAll = function () {
          $timeout(function () {
            document.getElementById('fileInput').click();
            $scope.isButtonClicked = true;
          })

        }

        $scope.setFile = function (element) {
          $scope.$apply(function ($scope) {
            $scope.theFile = element.files[0];
            fileHelper(element.files[0]);
          });
        };

        $scope.getFunctions = function (app) {
          return app.userProperties.functions && JSON.parse(JSON.stringify(app.userProperties.functions));
        }

        $scope.$watch('checkboxes.showGettingStarted', (newValue, oldValue) => {
          if (typeof newValue !== 'undefined') {
            localStorage.setItem('show-getting-started', $scope.checkboxes.showGettingStarted);
          }
        })

        $scope.$watch('themeObj.selected', (newThemeName, oldThemeName) => {
          if (newThemeName) {
            let allThemes = $scope.themeObj.all.slice(0).map(t => {
              return {
                name: t.name,
                displayName: t.displayName
              }
            });

            $scope.glueInstance.contexts.set('Connect.Themes', { all: allThemes, selected: newThemeName })
              .then(() => {
              })
          }
        }, false)

        $scope.themeSelectText = function (e) {
          let selectedThemeName = '';
          $scope.themeObj.all.forEach(theme => {
            if (theme.name === $scope.themeObj.selected) {
              selectedThemeName = theme.displayName || theme.name;
            }
          });

          return selectedThemeName;
        }

        $scope.updateRunningApps = function () {
          console.log('update running apps');
          $scope.runningApps = [];
          $scope.glueInstance.appManager.instances().forEach(function (i) {
            if (typeof $scope.glueInstance.appManager.myInstance !== 'undefined' && $scope.glueInstance.appManager.myInstance.id === (i.window && i.window.id)) {
              //don't count the AppManager app itself
              return;
            }

            if (i.application && i.application.type === 'exe' && i.application.hidden !== true && i.application.autoStart !== true) {
              //if the app is exe, don't look for a window, but don't show hidden exe apps and autoStart exes
              $scope.runningApps.push(i);
            } else {
              if (i.window && i.window.isVisible) {
                //add non-exe apps that have a visible window
                if (i.inActivity && !i.isActivityInstance) {
                  //but don't add instances that are part of an activity and not the owner
                  return;
                }

                $scope.runningApps.push(i);
                i.window.onFrameColorChanged(function (w) {
                  console.log('frame color changed for window ', w);
                  console.log(w.frameColor);
                  var el = angular.element('#frameColor_' + w.id)
                  el.css('background-color', w.frameColor);
                })
              }
            }
          })
        }

        $scope.objectKeys = function (obj) {
          if (!obj) {
            return [];
          }
          return Object.keys(obj);
        }

        $scope.getLayouts = () => {
          let swimlaneLayouts = getSwimlaneLayouts();
          return $scope.layouts;
        }
      }
    ]
  );