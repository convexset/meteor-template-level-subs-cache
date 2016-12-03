// import { Meteor } from 'meteor/meteor';
import { Template } from 'meteor/templating';
import { Tracker } from 'meteor/tracker';

import SubsCache from 'meteor/jimmiebtlr:subs-cache';  // default export

import { createCachedSubscriptionInstance } from './create-cached-subscription-instance';
import { DefaultSubscriptions } from './default-subscriptions';

import { checkNpmVersions } from 'meteor/tmeasday:check-npm-versions';
checkNpmVersions({
	'package-utils': '^0.2.1',
	'underscore': '^1.8.3',
});
const PackageUtilities = require('package-utils');
const _ = require('underscore');

/* eslint-disable no-console */

const TemplateLevelSubsCache = (function() {
	// eslint-disable-next-line no-shadow
	const _tlsc = function TemplateLevelSubsCache() {};
	const tlsc = new _tlsc();

	// Debug Mode
	let _debugMode = false;
	PackageUtilities.addPropertyGetterAndSetter(tlsc, 'DEBUG_MODE', {
		get: () => _debugMode,
		set: (value) => {
			_debugMode = !!value;
		},
	});

	// Logger
	let _logger = function defaultInfoLogger() {
		console.info(...arguments);
	};
	PackageUtilities.addPropertyGetterAndSetter(tlsc, 'LOG', {
		get: () => _logger,
		set: (fn) => {
			if (_.isFunction(fn)) {
				_logger = fn;
			}
		},
	});

	PackageUtilities.addImmutablePropertyFunction(tlsc, 'makeCache', function makeCache(options = {}) {
		// See: https://atmospherejs.com/ccorcos/subs-cache
		options = _.extend({
			expireAfter: 5, // in minutes
			cacheLimit: -1 // number of subscriptions to cache; -1 for infinite
		}, options);

		const subsCache = new SubsCache(options);

		// eslint-disable-next-line camelcase
		const _tlscI = function TemplateLevelSubsCache_Instance() {};
		const tlscInstance = new _tlscI();

		PackageUtilities.addImmutablePropertyObject(tlscInstance, 'options', options);

		PackageUtilities.addImmutablePropertyFunction(tlscInstance, 'prepareCachedSubscription', function cachedSubscription(tmpls, subId, subscriptionArgs, pcsOptions = {}) {
			let templates;
			if (_.isArray(tmpls)) {
				templates = tmpls;
			} else {
				templates = [tmpls];
			}

			pcsOptions = _.extend({
				startOnCreated: true,
				expireAfter: null,
				beforeStart: null,
				afterStart: null,
				onReady: null,
				beforeStop: null,
				afterStop: null,
				replaceSubscriptionsReady: true,
				replaceSubscriptionsReady_checkOnAllAncestors: true,
				argValidityPredicate: () => true,
			}, pcsOptions);

			templates.forEach(template => {
				let isExcludedBecauseExisting = false;

				template.onCreated(function TemplateLevelSubsCacheOnCreated() {
					const instance = this;
					if (typeof instance.cachedSubscription === 'undefined') {
						instance.cachedSubscription = createCachedSubscriptionInstance(instance, tlscInstance, subsCache, tlsc);

						if (pcsOptions.replaceSubscriptionsReady) {
							if (pcsOptions.replaceSubscriptionsReady_checkOnAllAncestors) {
								instance.subscriptionsReady = instance.cachedSubscription.allSubsReadyAllAncestors;
							} else {
								instance.subscriptionsReady = instance.cachedSubscription.allSubsReady;
							}
						}
					}

					// update subs list
					const subsNameList = Tracker.nonreactive(() => {
						return instance.cachedSubscription.__cachedSubscriptionList.get().map(x => x);
					});
					if (subsNameList.indexOf(subId) > -1) {
						console.warn(`[Cached Subscription]{${new Date()}} ${instance.view.name} already has a sub with id ${subId}. Excluding.`);
						isExcludedBecauseExisting = true;
						return;
					}
					subsNameList.push(subId);
					instance.cachedSubscription.__cachedSubscriptionList.set(subsNameList);
					instance.cachedSubscription.__cachedSubscriptionArgs[subId] = subscriptionArgs;

					// dealing with the strange case where the template gets destroyed
					// before the sub starts
					instance.cachedSubscription.__allowStartSubCall[subId] = true;
					instance.cachedSubscription.__startSubCalled[subId] = false;

					// store pcsOptions by subId
					instance.cachedSubscription.__options[subId] = pcsOptions;
				});


				if (pcsOptions.startOnCreated) {
					template.onCreated(function TemplateLevelSubsCacheStartOnCreated() {
						if (isExcludedBecauseExisting) {
							return;
						}

						const instance = this;
						(function checkAndStartSubOnCreated() {
							if (!instance.___tlsc_on_destroy_called__) {
								if (!instance.cachedSubscription) {
									setTimeout(checkAndStartSubOnCreated, 1);
								}
								if (_debugMode) {
									tlsc.LOG(`[Cached Subscription]{${new Date()}} ${instance.view.name}.onCreated for ${subId}`);
								}
								if (instance.cachedSubscription.__allowStartSubCall[subId]) {
									instance.cachedSubscription.startSub(subId);
									instance.cachedSubscription.__startSubCalled[subId] = true;
								} else {
									tlsc.LOG(`[Cached Subscription]{${new Date()}} ${instance.view.name}.onCreated for ${subId}[PREVENTED!]`);
								}
							}
						})();
					});
				} else {
					template.onRendered(function TemplateLevelSubsCacheStartOnRendered() {
						if (isExcludedBecauseExisting) {
							return;
						}

						const instance = this;
						(function checkAndStartSubOnRendered() {
							if (!instance.___tlsc_on_destroy_called__) {
								if (!instance.cachedSubscription) {
									setTimeout(checkAndStartSubOnRendered, 1);
								}
								if (_debugMode) {
									tlsc.LOG(`[Cached Subscription]{${new Date()}} ${instance.view.name}.onRendered for ${subId}`);
								}
								if (instance.cachedSubscription.__allowStartSubCall[subId]) {
									instance.cachedSubscription.startSub(subId);
									instance.cachedSubscription.__startSubCalled[subId] = true;
								} else {
									tlsc.LOG(`[Cached Subscription]{${new Date()}} ${instance.view.name}.onRendered for ${subId}[PREVENTED!]`);
								}
							}
						})();
					});
				}

				template.onDestroyed(function TemplateLevelSubsCacheOnDestroyed() {
					if (isExcludedBecauseExisting) {
						return;
					}

					const instance = this;
					instance.cachedSubscription.__allowStartSubCall[subId] = false;
					if (_debugMode) {
						tlsc.LOG(`[Cached Subscription]{${new Date()}} ${instance.view.name}.onDestroyed for ${subId}`);
					}
					if (instance.cachedSubscription.__startSubCalled[subId]) {
						instance.cachedSubscription.stopSub(subId);
					} else {
						tlsc.LOG(`[Cached Subscription]{${new Date()}} ${instance.view.name}.onDestroyed for ${subId} (Sub was never started.)`);
					}

					instance.___tlsc_on_destroy_called__ = true;
				});

				template.helpers({
					cachedSubReady: id => Template.instance().cachedSubscription.subReady(id),
					allCachedSubsReady: () => Template.instance().cachedSubscription.cachedSubsReady(),
				});
			});
		});

		return tlscInstance;
	});

	let _defaultCache = tlsc.makeCache();
	PackageUtilities.addPropertyGetter(tlsc, 'DEFAULT_CACHE', () => _defaultCache);
	PackageUtilities.addImmutablePropertyFunction(tlsc, 'replaceDefaultCache', function replaceDefaultCache(rdcOptions) {
		_defaultCache = tlsc.makeCache(rdcOptions);
	});

	function areAllSubsReadyCheck(instance) {
		let isReady;
		if (!!instance.cachedSubscription) {
			isReady = instance.cachedSubscription.allSubsReady();
		} else {
			const templateLevelSubsReady = instance.subscriptionsReady();
			const defaultSubsReady = DefaultSubscriptions.allReady();
			isReady = templateLevelSubsReady && defaultSubsReady;
		}
		return isReady;
	}

	Template.registerHelper('allSubsReady', function allSubsReady() {
		return areAllSubsReadyCheck(Template.instance());
	});

	const Decorators = {};
	PackageUtilities.addMutablePropertyObject(tlsc, 'Decorators', Decorators);
	PackageUtilities.addImmutablePropertyFunction(Decorators, 'whenAllSubsReady', function whenAllSubsReady(
		body = function() {},
		before = function() {},
		after = function() {}
	) {
		return function() {
			const instance = this;
			instance.autorun(c => {
				before.call(instance, c);

				const isReady = areAllSubsReadyCheck(instance);

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
	const ReactiveParamGetter = {};
	PackageUtilities.addMutablePropertyObject(tlsc, 'ReactiveParamGetter', ReactiveParamGetter);

	PackageUtilities.addImmutablePropertyFunction(ReactiveParamGetter, 'fromArrayToArray', function makeReactiveParamGetterFromArrayToArray(arrParamNames, reactiveParamGetter) {
		const _params = PackageUtilities.shallowCopy(arrParamNames);
		return () => _params.map(k => reactiveParamGetter(k));
	});

	PackageUtilities.addImmutablePropertyFunction(ReactiveParamGetter, 'fromArrayToObj', function makeReactiveParamGetterFromArrayToObj(arrParamNames, reactiveParamGetter) {
		const _params = PackageUtilities.shallowCopy(arrParamNames);
		return () => _.object(_params.map(k => [k, reactiveParamGetter(k)]));
	});

	PackageUtilities.addImmutablePropertyFunction(ReactiveParamGetter, 'fromObjToObj', function makeReactiveParamGetterFromObjToObj(objParamNames, reactiveParamGetter) {
		const _params = PackageUtilities.shallowCopy(objParamNames);
		return () => _.object(_.map(_params, (p, k) => [k, reactiveParamGetter(p)]));
	});

	PackageUtilities.addImmutablePropertyFunction(ReactiveParamGetter, 'fromName', function makeReactiveParamGetterFromName(paramName, reactiveParamGetter) {
		return () => reactiveParamGetter(paramName);
	});
	/////////////////////////////////////////////////////////////////////////////

	return tlsc;
})();

export { TemplateLevelSubsCache };
