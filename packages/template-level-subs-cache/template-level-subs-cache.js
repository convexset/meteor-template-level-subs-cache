/* global TemplateLevelSubsCache: true */
/* global createCachedSubscriptionInstance: true */
/* global DefaultSubscriptions: true */
/* global SubsCache: true */

import { checkNpmVersions } from 'meteor/tmeasday:check-npm-versions';
checkNpmVersions({
  'package-utils': '^0.2.1',
  'underscore' : '^1.8.3',
});
const PackageUtilities = require('package-utils');
const _ = require('underscore');

TemplateLevelSubsCache = (function() {
	var _tlsc = function TemplateLevelSubsCache() {};
	var tlsc = new _tlsc();

	// Debug Mode
	var _debugMode = false;
	PackageUtilities.addPropertyGetterAndSetter(tlsc, "DEBUG_MODE", {
		get: () => _debugMode,
		set: (value) => {
			_debugMode = !!value;
		},
	});

	// Logger
	var _logger = function defaultInfoLogger() {
		console.info.apply(console, _.toArray(arguments));
	};
	PackageUtilities.addPropertyGetterAndSetter(tlsc, "LOG", {
		get: () => _logger,
		set: (fn) => {
			if (_.isFunction(fn)) {
				_logger = fn;
			}
		},
	});

	PackageUtilities.addImmutablePropertyFunction(tlsc, "makeCache", function makeCache(options = {}) {
		// See: https://atmospherejs.com/ccorcos/subs-cache
		options = _.extend({
			expireAfter: 5, // in minutes
			cacheLimit: -1 // number of subscriptions to cache; -1 for infinite
		}, options);

		var subsCache = new SubsCache(options);

		var _tlscI = function TemplateLevelSubsCache_Instance() {};
		var tlscInstance = new _tlscI();

		PackageUtilities.addImmutablePropertyObject(tlscInstance, "options", options);

		PackageUtilities.addImmutablePropertyFunction(tlscInstance, "prepareCachedSubscription", function cachedSubscription(tmpls, subId, subscriptionArgs, options = {}) {
			var templates;
			if (_.isArray(tmpls)) {
				templates = tmpls;
			} else {
				templates = [tmpls];
			}

			options = _.extend({
				startOnCreated: true,
				expireAfter: null,
				beforeStart: null,
				afterStart: null,
				onReady: null,
				beforeStop: null,
				afterStop: null,
				argValidityPredicate: () => true,
			}, options);

			templates.forEach(function(template) {
				template.onCreated(function tlsc_onCreated() {
					var instance = this;
					if (typeof instance.cachedSubscription === "undefined") {
						instance.cachedSubscription = createCachedSubscriptionInstance(instance, tlscInstance, subsCache);
					}

					// dealing with the strange case where the template gets destroyed
					// before the sub starts
					instance.cachedSubscription.__allowStartSubCall[subId] = true;
					instance.cachedSubscription.__startSubCalled[subId] = false;

					// store options by subId
					instance.cachedSubscription.__options[subId] = options;

					var subsNameList = Tracker.nonreactive(function() {
						return instance.cachedSubscription.__cachedSubscriptionList.get().map(x => x);
					});
					if (subsNameList.indexOf(subId) > -1) {
						throw new Meteor.Error("id-already-exists", subId);
					}
					subsNameList.push(subId);
					instance.cachedSubscription.__cachedSubscriptionList.set(subsNameList);
					instance.cachedSubscription.__cachedSubscriptionArgs[subId] = subscriptionArgs;
				});


				if (options.startOnCreated) {
					template.onCreated(function TemplateLevelSubsCache_onCreated() {
						var instance = this;
						if (_debugMode) {
							tlsc.LOG("[Cached Subscription]{" + (new Date()) + "} " + instance.view.name + ".onCreated for " + subId);
						}
						if (instance.cachedSubscription.__allowStartSubCall[subId]) {
							instance.cachedSubscription.startSub(subId);
							instance.cachedSubscription.__startSubCalled[subId] = true;
						} else {
							tlsc.LOG("[Cached Subscription]{" + (new Date()) + "} " + instance.view.name + ".onCreated for " + subId + '[PREVENTED!]');
						}
					});
				} else {
					template.onRendered(function TemplateLevelSubsCache_onRendered() {
						var instance = this;
						if (_debugMode) {
							tlsc.LOG("[Cached Subscription]{" + (new Date()) + "} " + instance.view.name + ".onRendered for " + subId);
						}
						if (instance.cachedSubscription.__allowStartSubCall[subId]) {
							instance.cachedSubscription.startSub(subId);
							instance.cachedSubscription.__startSubCalled[subId] = true;
						} else {
							tlsc.LOG("[Cached Subscription]{" + (new Date()) + "} " + instance.view.name + ".onRendered for " + subId + '[PREVENTED!]');
						}
					});
				}

				template.onDestroyed(function TemplateLevelSubsCache_onDestroyed() {
					var instance = this;
					instance.cachedSubscription.__allowStartSubCall[subId] = false;
					if (_debugMode) {
						tlsc.LOG("[Cached Subscription]{" + (new Date()) + "} " + instance.view.name + ".onDestroyed for " + subId);
					}
					if (instance.cachedSubscription.__startSubCalled[subId]) {
						instance.cachedSubscription.stopSub(subId);
					} else {
						tlsc.LOG("[Cached Subscription]{" + (new Date()) + "} " + instance.view.name + ".onDestroyed for " + subId + " (Sub was never started.)");
					}
				});

				template.helpers({
					cachedSubReady: id => Template.instance().cachedSubscription.subReady(id),
					allCachedSubsReady: () => Template.instance().cachedSubscription.cachedSubsReady(),
				});
			});

		});

		return tlscInstance;
	});

	PackageUtilities.addImmutablePropertyValue(tlsc, "DEFAULT_CACHE", tlsc.makeCache());

	function areAllSubsReadyCheck(instance) {
		var isReady;
		if (!!instance.cachedSubscription) {
			isReady = instance.cachedSubscription.allSubsReady();
		} else {
			var templateLevelSubsReady = instance.subscriptionsReady();
			var defaultSubsReady = DefaultSubscriptions.allReady();
			isReady = templateLevelSubsReady && defaultSubsReady;
		}
		return isReady;
	}

	Template.registerHelper('allSubsReady', function allSubsReady() {
		return areAllSubsReadyCheck(Template.instance());
	});

	var Decorators = {};
	PackageUtilities.addMutablePropertyObject(tlsc, 'Decorators', Decorators);
	PackageUtilities.addImmutablePropertyFunction(Decorators, 'whenAllSubsReady', function whenAllSubsReady(
		body = function() {},
		before = function() {},
		after = function() {}
	) {
		return function() {
			var instance = this;
			instance.autorun(function(c) {
				before.call(instance, c);

				var isReady = areAllSubsReadyCheck(instance);

				if (isReady) {
					body.call(instance, c);
					c.stop();
				}
				after.call(instance, c);
			});
		};
	});

	/////////////////////////////////////////////////////////////////////////////
	// ReactiveParamGetter
	/////////////////////////////////////////////////////////////////////////////
	var ReactiveParamGetter = {};
	PackageUtilities.addMutablePropertyObject(tlsc, 'ReactiveParamGetter', ReactiveParamGetter);

	PackageUtilities.addImmutablePropertyFunction(ReactiveParamGetter, 'fromArrayToArray', function makeReactiveParamGetter_fromArrayToArray(arrParamNames, ReactiveParamGetter) {
		var _params = PackageUtilities.shallowCopy(arrParamNames);
		return () => _params.map(k => ReactiveParamGetter(k));
	});

	PackageUtilities.addImmutablePropertyFunction(ReactiveParamGetter, 'fromArrayToObj', function makeReactiveParamGetter_fromArrayToObj(arrParamNames, ReactiveParamGetter) {
		var _params = PackageUtilities.shallowCopy(arrParamNames);
		return () => _.object(_params.map(k => [k, ReactiveParamGetter(k)]));
	});

	PackageUtilities.addImmutablePropertyFunction(ReactiveParamGetter, 'fromObjToObj', function makeReactiveParamGetter_fromObjToObj(objParamNames, ReactiveParamGetter) {
		var _params = PackageUtilities.shallowCopy(objParamNames);
		return () => _.object(_.map(_params, (p, k) => [k, ReactiveParamGetter(p)]));
	});

	PackageUtilities.addImmutablePropertyFunction(ReactiveParamGetter, 'fromName', function makeReactiveParamGetter_fromName(paramName, ReactiveParamGetter) {
		return () => ReactiveParamGetter(paramName);
	});
	/////////////////////////////////////////////////////////////////////////////

	return tlsc;
})();