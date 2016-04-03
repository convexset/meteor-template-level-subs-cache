/* global TemplateLevelSubsCache: true */
/* global DefaultSubscriptions: true */
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
										if (_.isFunction(options.beforeStart)) {
											Tracker.nonreactive(function() {
												options.beforeStart(instance, id, _subscriptionArgs);
											});
										}
										if (_debugMode) {
											console.log("[Cached Subscription]{" + (new Date()) + "} " + id + ": before start (" + instance.view.name + ")");
										}

										instance.cachedSubscription.__cachedSubscriptionIdx += 1;

										var newIdx = instance.cachedSubscription.__cachedSubscriptionIdx;
										instance.cachedSubscription.__cachedSubscriptionId.set(id, newIdx);

										var sub;
										if (typeof options.expireAfter === "number") {
											sub = subsCache.subscribeFor.apply(subsCache, [options.expireAfter].concat(_subscriptionArgs));
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
													if (_.isFunction(options.onReady)) {
														Tracker.nonreactive(function() {
															options.onReady(instance, id, _subscriptionArgs);
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
										if (_.isFunction(options.afterStart)) {
											Tracker.nonreactive(function() {
												options.afterStart(instance, id, _subscriptionArgs);
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
								if (!subAndComp) {
									throw new Meteor.Error('no-started-sub-with-id', id);
								} else {
									if (_debugMode) {
										console.log("[Cached Subscription]{" + (new Date()) + "} " + id + ": Stopping...", EJSON.stringify(subAndComp.args), "(" + instance.view.name + ")");
									}

									// Before Stop
									if (_.isFunction(options.beforeStop)) {
										Tracker.nonreactive(function() {
											options.beforeStop(instance, id, subAndComp.args);
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
											if (_.isFunction(options.afterStop)) {
												Tracker.nonreactive(function() {
													options.afterStop(instance, id, subAndComp.args);
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
											if (_.isFunction(options.afterStop)) {
												Tracker.nonreactive(function() {
													options.afterStop(instance, id, subAndComp.args);
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
					template.onRendered(function TemplateLevelSubsCache_onCreated() {
						var instance = this;
						if (_debugMode) {
							console.log("[Cached Subscription]{" + (new Date()) + "} " + instance.view.name + ".onCreated for " + subId);
						}
						instance.cachedSubscription.startSub(subId);
					});
				} else {
					template.onRendered(function TemplateLevelSubsCache_onRendered() {
						var instance = this;
						if (_debugMode) {
							console.log("[Cached Subscription]{" + (new Date()) + "} " + instance.view.name + ".onRendered for " + subId);
						}
						instance.cachedSubscription.startSub(subId);
					});
				}

				template.onDestroyed(function TemplateLevelSubsCache_onDestroyed() {
					var instance = this;
					if (_debugMode) {
						console.log("[Cached Subscription]{" + (new Date()) + "} " + instance.view.name + ".onDestroyed for " + subId);
					}
					instance.cachedSubscription.stopSub(subId);
				});

				template.helpers({
					cachedSubReady: id => Template.instance().cachedSubscription.subReady(id),
					allCachedSubsReady: () => Template.instance().cachedSubscription.cachedSubsReady(),
				});
			});

		});

		return tlscInstance;
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

	return tlsc;
})();