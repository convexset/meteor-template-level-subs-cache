/* global TemplateLevelSubsCache: true */
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
			}, options);

			templates.forEach(function(template) {
				template.onCreated(function tlsc_onCreated() {
					var instance = this;
					if (typeof instance.cachedSubscription === "undefined") {
						instance.cachedSubscription = {
							__cachedSubscriptionIdx: 1,
							__cachedSubscriptionsAllReady: new ReactiveVar(1),
							__cachedSubscriptionId: new ReactiveDict(),
							__cachedSubscriptionList: new ReactiveVar([]),
							__cachedSubscription: {},
							__cachedSubscriptionReady: {},
							__cachedSubscriptionArgs: {},
							__cachedSubscriptionStarted: {},
							__allowStartSubCall: {},
							__startSubCalled: {},
							__options: {},
							getSubInfo: function getSubInfo(id) {
								var _subId = instance.cachedSubscription.__cachedSubscriptionId.get(id);
								var subInfo = instance.cachedSubscription.__cachedSubscription[_subId];
								if (_debugMode) {
									console.log("[Cached Subscription]{" + (new Date()) + "} getSubInfo(" + id + ") -->", subInfo, "(" + instance.view.name + ")");
								}
								return subInfo;
							},
							getSub: function getSub(id) {
								var subInfo = instance.cachedSubscription.getSubInfo(id);
								var sub = subInfo && subInfo.sub || null;
								if (_debugMode) {
									console.log("[Cached Subscription]{" + (new Date()) + "} getSub(" + id + ") -->", sub, "(" + instance.view.name + ")");
								}
								return sub;
							},
							startSub: function startSub(id) {
								if (_debugMode) {
									console.log("[Cached Subscription]{" + (new Date()) + "} Calling startSub(" + id + ")...", "(" + instance.view.name + ")");
								}

								var subOptions = instance.cachedSubscription.__options[id];
								var tlscOptions = tlscInstance.options;

								if (!!instance.cachedSubscription.__cachedSubscriptionStarted[id]) {
									throw new Meteor.Error("sub-already-started", id);
								}
								instance.cachedSubscription.__cachedSubscriptionStarted[id] = true;

								instance.autorun(function overallSubscriptionRoutine(c) {
									var _subscriptionArgs = instance.cachedSubscription.__cachedSubscriptionArgs[id].map(x => _.isFunction(x) ? x(instance) : x);
									if (!c.firstRun) {
										var subAndComp = instance.cachedSubscription.getSubInfo(id);
										if (!subAndComp) {
											throw new Meteor.Error('unexpected-missing-subscription-info-for-existing-subscription', id);
										}
										if (_debugMode) {
											console.log("[Cached Subscription]{" + (new Date()) + "} " + id + ": Stopping prior to restart. Argument change " + EJSON.stringify(subAndComp.args) + " --> " + EJSON.stringify(_subscriptionArgs), "(" + instance.view.name + ")");
										}
										if (!_.isEqual(subAndComp.args, _subscriptionArgs)) {
											instance.cachedSubscription.stopSub(id, false);
										} else {
											if (_debugMode) {
												console.log("[Cached Subscription]{" + (new Date()) + "} No argument change " + EJSON.stringify(subAndComp.args) + " --> " + EJSON.stringify(_subscriptionArgs) + "; Not doing anything.", "(" + instance.view.name + ")");
											}
											return;
										}
									}
									setTimeout(function startSubscriptionRoutine() {
										if (_debugMode) {
											console.log("[Cached Subscription]{" + (new Date()) + "} " + id + ": " + (c.firstRun ? "Starting" : "Restarting") + "...", EJSON.stringify(_subscriptionArgs), "(" + instance.view.name + ")");
										}

										// Before Start
										if (_.isFunction(subOptions.beforeStart)) {
											Tracker.nonreactive(function() {
												subOptions.beforeStart(instance, id, _subscriptionArgs);
											});
										}
										if (_debugMode) {
											console.log("[Cached Subscription]{" + (new Date()) + "} " + id + ": before start (" + instance.view.name + ")");
										}

										instance.cachedSubscription.__cachedSubscriptionIdx += 1;

										var newIdx = instance.cachedSubscription.__cachedSubscriptionIdx;
										instance.cachedSubscription.__cachedSubscriptionId.set(id, newIdx);

										var sub;
										if (typeof tlscOptions.expireAfter === "number") {
											sub = subsCache.subscribeFor.apply(subsCache, [tlscOptions.expireAfter].concat(_subscriptionArgs));
										} else {
											sub = subsCache.subscribe.apply(subsCache, _subscriptionArgs);
										}

										instance.cachedSubscription.__cachedSubscriptionsAllReady.set(newIdx);
										instance.cachedSubscription.__cachedSubscriptionReady[newIdx] = new ReactiveVar(false);

										var csRecord = {
											sub: sub,
											computation: c,
											args: _subscriptionArgs,
											idx: instance.cachedSubscription.__cachedSubscriptionIdx,
											readyComputation: null,
										};
										instance.cachedSubscription.__cachedSubscription[instance.cachedSubscription.__cachedSubscriptionIdx] = csRecord;
										setTimeout(function subReadyRoutine() {
											csRecord.readyComputation = Tracker.autorun(function(c_r) {
												if (sub.ready()) {
													instance.cachedSubscription.__cachedSubscriptionReady[newIdx].set(true);
													if (_.isFunction(subOptions.onReady)) {
														Tracker.nonreactive(function() {
															subOptions.onReady(instance, id, _subscriptionArgs);
														});
													}
													if (_debugMode) {
														console.log("[Cached Subscription]{" + (new Date()) + "} " + id + ": on ready (" + instance.view.name + ")");
													}
													c_r.stop();
												}
											});
										}, 0);

										// After Start
										if (_.isFunction(subOptions.afterStart)) {
											Tracker.nonreactive(function() {
												subOptions.afterStart(instance, id, _subscriptionArgs);
											});
										}
										if (_debugMode) {
											console.log("[Cached Subscription]{" + (new Date()) + "} " + id + ": after start (" + instance.view.name + ")");
										}
									}, 0);
								});
							},
							stopSub: function stopSub(id, stopOverallComputation = true) {
								var subAndComp = instance.cachedSubscription.getSubInfo(id);
								var subOptions = instance.cachedSubscription.__options[id];
								if (!subAndComp) {
									throw new Meteor.Error('no-started-sub-with-id', id);
								} else {
									if (_debugMode) {
										console.log("[Cached Subscription]{" + (new Date()) + "} " + id + ": Stopping...", EJSON.stringify(subAndComp.args), "(" + instance.view.name + ")");
									}

									// Before Stop
									if (_.isFunction(subOptions.beforeStop)) {
										Tracker.nonreactive(function() {
											subOptions.beforeStop(instance, id, subAndComp.args);
										});
									}
									if (_debugMode) {
										console.log("[Cached Subscription]{" + (new Date()) + "} " + id + ": before stop (" + instance.view.name + ")");
									}

									Tracker.autorun(function(c) {
										if (subAndComp.sub.ready()) {
											subAndComp.sub.stop();
											if (stopOverallComputation && !!subAndComp.computation && !subAndComp.computation.stopped) {
												subAndComp.computation.stop();
											}
											if (!!subAndComp.readyComputation) {
												subAndComp.readyComputation.stop();
											} else {
												console.log("[Cached Subscription]{" + (new Date()) + "} " + id + ": Missing ready computation. (Args: " + EJSON.stringify(subAndComp.args) + ")", "(" + instance.view.name + ")");
											}
											instance.cachedSubscription.__cachedSubscriptionStarted[id] = false;

											// After Stop
											if (_.isFunction(subOptions.afterStop)) {
												Tracker.nonreactive(function() {
													subOptions.afterStop(instance, id, subAndComp.args);
												});
											}
											if (_debugMode) {
												console.log("[Cached Subscription]{" + (new Date()) + "} " + id + ": after stop (" + instance.view.name + ")");
											}
											subAndComp.sub.stop();
											if (stopOverallComputation && !!subAndComp.computation && !subAndComp.computation.stopped) {
												subAndComp.computation.stop();
											}
											if (!!subAndComp.readyComputation) {
												subAndComp.readyComputation.stop();
											} else {
												console.log("[Cached Subscription]{" + (new Date()) + "} " + id + ": Missing ready computation. (Args: " + EJSON.stringify(subAndComp.args) + ")", "(" + instance.view.name + ")");
											}
											instance.cachedSubscription.__cachedSubscriptionStarted[id] = false;

											// After Stop
											if (_.isFunction(subOptions.afterStop)) {
												Tracker.nonreactive(function() {
													subOptions.afterStop(instance, id, subAndComp.args);
												});
											}
											if (_debugMode) {
												console.log("[Cached Subscription]{" + (new Date()) + "} " + id + ": after stop (" + instance.view.name + ")");
											}

											c.stop();
										}
									});
								}
							},
							restartSub: function restartSub(id) {
								if (_debugMode) {
									console.log("[Cached Subscription]{" + (new Date()) + "} Calling restartSub(" + id + ")...", "(" + instance.view.name + ")");
								}
								instance.cachedSubscription.stopSub(id);
								setTimeout(function initiateStartSub() {
									instance.cachedSubscription.startSub(id);
								}, 0);
							},
							cachedSubReady: function cachedSubReady(id) {
								var idx = instance.cachedSubscription.__cachedSubscriptionId.get(id);
								var result;
								if (typeof idx !== "undefined") {
									result = instance.cachedSubscription.__cachedSubscriptionReady[idx].get();
								} else {
									result = false;
								}
								if (_debugMode) {
									console.log("[Cached Subscription]{" + (new Date()) + "} cachedSubReady(" + id + ") --> " + result, "(" + instance.view.name + ")");
								}
								return result;
							},
							allCachedSubsReady: function allCachedSubsReady() {
								var isReady = !!instance.cachedSubscription.__cachedSubscriptionsAllReady.get();
								var subsNameList = instance.cachedSubscription.__cachedSubscriptionList.get();
								subsNameList.forEach(function(id) {
									// evaluate everything
									// avoid short circuit evaluation to achieve proper reactivity
									isReady = instance.cachedSubscription.cachedSubReady(id) && isReady;
								});
								if (_debugMode) {
									console.log("[Cached Subscription]{" + (new Date()) + "} allCachedSubsReady() --> " + isReady, "(" + instance.view.name + ")");
								}
								return isReady;
							},
							allSubsReady: function allSubsReady() {
								var allCachedSubsReady = instance.cachedSubscription.allCachedSubsReady();
								var templateLevelSubsReady = instance.subscriptionsReady();
								var defaultSubsReady = DefaultSubscriptions.allReady();
								// avoid short circuit evaluation to achieve proper reactivity
								var isReady = allCachedSubsReady && templateLevelSubsReady && defaultSubsReady;
								if (_debugMode) {
									console.log("[Cached Subscription]{" + (new Date()) + "} allSubsReady() --> " + isReady, "(" + instance.view.name + ")");
								}
								return isReady;
							},
						};
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
							console.log("[Cached Subscription]{" + (new Date()) + "} " + instance.view.name + ".onCreated for " + subId);
						}
						if (instance.cachedSubscription.__allowStartSubCall[subId]) {
							instance.cachedSubscription.startSub(subId);
							instance.cachedSubscription.__startSubCalled[subId] = true;
						} else {
							console.warn("[Cached Subscription]{" + (new Date()) + "} " + instance.view.name + ".onCreated for " + subId + '[PREVENTED!]');
						}
					});
				} else {
					template.onRendered(function TemplateLevelSubsCache_onRendered() {
						var instance = this;
						if (_debugMode) {
							console.log("[Cached Subscription]{" + (new Date()) + "} " + instance.view.name + ".onRendered for " + subId);
						}
						if (instance.cachedSubscription.__allowStartSubCall[subId]) {
							instance.cachedSubscription.startSub(subId);
							instance.cachedSubscription.__startSubCalled[subId] = true;
						} else {
							console.warn("[Cached Subscription]{" + (new Date()) + "} " + instance.view.name + ".onRendered for " + subId + '[PREVENTED!]');
						}
					});
				}

				template.onDestroyed(function TemplateLevelSubsCache_onDestroyed() {
					var instance = this;
					instance.cachedSubscription.__allowStartSubCall[subId] = false;
					if (_debugMode) {
						console.log("[Cached Subscription]{" + (new Date()) + "} " + instance.view.name + ".onDestroyed for " + subId);
					}
					if (instance.cachedSubscription.__startSubCalled[subId]) {
						instance.cachedSubscription.stopSub(subId);
					} else {
						console.warn("[Cached Subscription]{" + (new Date()) + "} " + instance.view.name + ".onDestroyed for " + subId + " (Sub was never started.)");
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

				var isReady;
				if (!!instance.cachedSubscription) {
					isReady = instance.cachedSubscription.allSubsReady();
				} else {
					var templateLevelSubsReady = instance.subscriptionsReady();
					var defaultSubsReady = DefaultSubscriptions.allReady();
					isReady = templateLevelSubsReady && defaultSubsReady;
				}

				if (isReady) {
					body.call(instance, c);
					c.stop();
				}
				after.call(instance, c);
			});
		};
	});

	Template.registerHelper('allSubsReady', function allSubsReady() {
		if (!!Template.instance().cachedSubscription) {
			return Template.instance().cachedSubscription.allSubsReady();
		} else {
			var templateLevelSubsReady = Template.instance().subscriptionsReady();
			var defaultSubsReady = DefaultSubscriptions.allReady();
			return templateLevelSubsReady && defaultSubsReady;
		}
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