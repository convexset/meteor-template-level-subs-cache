/* global TemplateLevelSubsCache: true */
/* global SubsCache: true */
/* global PackageUtilities: true */

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
			expireAfter: 2, // in minutes
			cacheLimit: -1 // number of subscriptions to cache; -1 for infinite
		}, options);

		var subsCache = new SubsCache(options);

		PackageUtilities.addImmutablePropertyFunction(subsCache, "cachedSubscription", function cachedSubscription(tmpls, subId, subscriptionArgs, options = {}) {
			/*
				Usage:
				subsCache.cachedSubscription(Template.TemplateName,
				                             'subscriptionIdHere',
				                             ['subscription-name', 'arg1', 'arg2', ...],
				                             {
												beforeStart: function(templateInstance, subscriptionId) { ... },
												afterStart: function(templateInstance, subscriptionId) { ... },
												onReady: function(templateInstance, subscriptionId) { ... },
												beforeStop: function(templateInstance, subscriptionId) { ... },
												afterStop: function(templateInstance, subscriptionId) { ... },
				                             });
					or
				subsCache.cachedSubscription(Template.TemplateName,
				                             'subscriptionIdHere',
				                             ['subscription-name', 'arg1', () => arg2(), ...],
				                             options);
					or
				subsCache.cachedSubscription([Template.TemplateName1, Template.TemplateName2, ...],
				                             'subscriptionIdHere',
				                             ['subscription-name', 'arg1', () => arg2(), ...],
				                             options);
			*/

			var templates;
			if (_.isArray(tmpls)) {
				templates = tmpls;
			} else {
				templates = [tmpls];
			}

			options = _.extend({
				beforeStart: function beforeStart(templateInstance, id) {
					if (_debugMode) {
						console.log("[Cached Subscription]{" + (new Date()) + "} " + id + ": before start (" + templateInstance.view.name + ")");
					}
				},
				afterStart: function afterStart(templateInstance, id) {
					if (_debugMode) {
						console.log("[Cached Subscription]{" + (new Date()) + "} " + id + ": after start (" + templateInstance.view.name + ")");
					}
				},
				onReady: function onReady(templateInstance, id) {
					if (_debugMode) {
						console.log("[Cached Subscription]{" + (new Date()) + "} " + id + ": on ready (" + templateInstance.view.name + ")");
					}
				},
				beforeStop: function beforeStop(templateInstance, id) {
					if (_debugMode) {
						console.log("[Cached Subscription]{" + (new Date()) + "} " + id + ": before stop (" + templateInstance.view.name + ")");
					}
				},
				afterStop: function afterStop(templateInstance, id) {
					if (_debugMode) {
						console.log("[Cached Subscription]{" + (new Date()) + "} " + id + ": after stop (" + templateInstance.view.name + ")");
					}
				},
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
								if (!!instance.cachedSubscription.__cachedSubscriptionStarted[id]) {
									throw new Meteor.Error("sub-already-started", id);
								}
								instance.cachedSubscription.__cachedSubscriptionStarted[id] = true;

								instance.autorun(function overallSubscriptionRoutine(c) {
									var _subscriptionArgs = instance.cachedSubscription.__cachedSubscriptionArgs[id].map(x => _.isFunction(x) ? x() : x);
									if (!c.firstRun) {
										var subAndComp = instance.cachedSubscription.getSubInfo(id);
										if (!subAndComp) {
											throw new Meteor.Error('unexpected-missing-subscription-info-for-existing-subscription');
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
										if (_.isFunction(options.beforeStart)) {
											options.beforeStart(instance, id);
										}
										instance.cachedSubscription.__cachedSubscriptionIdx += 1;

										var newIdx = instance.cachedSubscription.__cachedSubscriptionIdx;
										instance.cachedSubscription.__cachedSubscriptionId.set(id, newIdx);
										var sub = subsCache.subscribe.apply(subsCache, _subscriptionArgs);
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
													if (_.isFunction(options.onReady)) {
														options.onReady(instance, id);
													}
													c_r.stop();
												}
											});
										}, 0);
										if (_.isFunction(options.afterStart)) {
											options.afterStart(instance, id);
										}
									}, 0);
								});
							},
							stopSub: function stopSub(id, stopOverallComputation = true) {
								var subAndComp = instance.cachedSubscription.getSubInfo(id);
								if (!subAndComp) {
									throw new Meteor.Error('no-started-sub-with-id');
								} else {
									if (_debugMode) {
										console.log("[Cached Subscription]{" + (new Date()) + "} " + id + ": Stopping...", EJSON.stringify(subAndComp.args), "(" + instance.view.name + ")");
									}
									if (_.isFunction(options.beforeStop)) {
										options.beforeStop(instance, id);
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
									if (_.isFunction(options.afterStop)) {
										options.afterStop(instance, id);
									}
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
								// avoid short circuit evaluation to achieve proper reactivity
								var isReady = allCachedSubsReady && templateLevelSubsReady;
								if (_debugMode) {
									console.log("[Cached Subscription]{" + (new Date()) + "} allSubsReady() --> " + isReady, "(" + instance.view.name + ")");
								}
								return isReady;
							},
						};
					}

					var subsNameList = Tracker.nonreactive(function() {
						return instance.cachedSubscription.__cachedSubscriptionList.get().map(x => x);
					});
					if (subsNameList.indexOf(subId) > -1) {
						throw new Meteor.Error("id-already-exists", "subId exists: " + subId);
					}
					subsNameList.push(subId);
					instance.cachedSubscription.__cachedSubscriptionList.set(subsNameList);
					instance.cachedSubscription.__cachedSubscriptionArgs[subId] = subscriptionArgs;
				});

				template.onRendered(function tlsc_onRendered() {
					var instance = this;
					if (_debugMode) {
						console.log("[Cached Subscription]{" + (new Date()) + "} " + instance.view.name + ".onRendered for " + subId);
					}
					instance.cachedSubscription.startSub(subId);
				});

				template.onDestroyed(function tlsc_onDestroyed() {
					var instance = this;
					if (_debugMode) {
						console.log("[Cached Subscription]{" + (new Date()) + "} " + instance.view.name + ".onDestroyed for " + subId);
					}
					instance.cachedSubscription.stopSub(subId);
				});

				template.helpers({
					allCachedSubsReady: () => Template.instance().cachedSubscription.cachedSubsReady(),
					allSubsReady: () => Template.instance().cachedSubscription.allSubsReady(),
					cachedSubReady: id => Template.instance().cachedSubscription.subReady(id),
				});
			});

		});

		return subsCache;
	});

	return tlsc;
})();