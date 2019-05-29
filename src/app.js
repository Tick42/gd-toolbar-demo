    'use strict';

// Defining Angular app model with all other dependent modules
var clientContext = angular.module('clientContext',['ngRoute',
'ngMdIcons',
'clientContext.home',
'clientContext.glue',
'ngMaterial',
'ngMdBadge',
'ui.sortable'
]);

clientContext.config(function($routeProvider, $locationProvider, $httpProvider, $mdThemingProvider) {

	// Declaration of the default route if neither of the controllers
	// is supporting the request path
	$routeProvider.otherwise({ redirectTo: '/'});

	// Settings for http communications
	$httpProvider.defaults.useXDomain = true;
	delete $httpProvider.defaults.headers.common['X-Requested-With'];

  // $mdThemingProvider.theme('default')
  //     .primaryPalette('indigo')
  //      .backgroundPalette('grey');
      // .accentPalette('orange');


	// disabling # in Angular urls
	// $locationProvider.html5Mode({
	// 		enabled: true,
	//      requireBase: false
	// });
});


clientContext.directive('focusMe', function($timeout) {
  return {
    link: function(scope, element, attrs) {
      scope.$watch(attrs.focusMe, function(value) {
        if(value === true) { 
            element[0].focus();
            scope[attrs.focusMe] = false;
        }
      });
    }
  };
});

clientContext.directive('ngRightClick', function($parse) {
    return function(scope, element, attrs) {
        var fn = $parse(attrs.ngRightClick);
        element.bind('contextmenu', function(event) {
            scope.$apply(function() {
                event.preventDefault();
                fn(scope, {$event:event});
            });
        });
    };
});
clientContext.filter('highlight', function ($sce) {
    return function (text, phrase) {
        if (phrase) text = text.replace(new RegExp('(' + phrase + ')', 'gi'),
            '<span class="highlighted">$1</span>')

        return $sce.trustAsHtml(text)
    }
})
