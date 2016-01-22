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
						console.log("[Cached Subscription] " + id + ": before start (" + templateInstance.view.name + ")");
					}
				},
				afterStart: function afterStart(templateInstance, id) {
					if (_debugMode) {
						console.log("[Cached Subscription] " + id + ": after start (" + templateInstance.view.name + ")");
					}
				},
				onReady: function onReady(templateInstance, id) {
					if (_debugMode) {
						console.log("[Cached Subscription] " + id + ": on ready (" + templateInstance.view.name + ")");
					}
				},
				beforeStop: function beforeStop(templateInstance, id) {
					if (_debugMode) {
						console.log("[Cached Subscription] " + id + ": before stop (" + templateInstance.view.name + ")");
					}
				},
				afterStop: function afterStop(templateInstance, id) {
					if (_debugMode) {
						console.log("[Cached Subscription] " + id + ": after stop (" + templateInstance.view.name + ")");
					}
				},
			}, options);

			templates.forEach(function(template) {
				template.onCreated(function tlsc_onCreated() {
					var instance = this;
					if (typeof instance.cachedSubscription === "undefined") {
						instance.cachedSubscription = {
							__cachedSubscriptionsAllReady: new ReactiveVar(1),
							__cachedSubscriptionId: new ReactiveDict(),
							__cachedSubscriptionList: new ReactiveVar([]),
							__cachedSubscription: {},
							__cachedSubscriptionIdx: 0,
							__cachedSubscriptionArgs: {},
							__cachedSubscriptionStarted: {},
							getSub: function getSub(id) {
								var _subId = instance.cachedSubscription.__cachedSubscriptionId.get(id);
								return instance.cachedSubscription.__cachedSubscription[_subId];
							},
							startSub: function startSub(id) {
								if (_debugMode) {
									console.log("[Cached Subscription] Calling startSub(" + id + ")...", "(" + instance.view.name + ")");
								}
								if (!!instance.cachedSubscription.__cachedSubscriptionStarted[id]) {
									throw new Meteor.Error("sub-already-started", id);
								}
								instance.cachedSubscription.__cachedSubscriptionStarted[id] = true;

								instance.autorun(function overallSubscriptionRoutine(c) {
									var _subscriptionArgs = instance.cachedSubscription.__cachedSubscriptionArgs[id].map(x => _.isFunction(x) ? x() : x);
									if (!c.firstRun) {
										var subAndComp = instance.cachedSubscription.getSub(id);
										if (!subAndComp) {
											throw new Meteor.Error('unexpected-missing-subscription-info-for-existing-subscription');
										}
										if (_debugMode) {
											console.log("[Cached Subscription] " + id + ": Stopping prior to restart. Argument change " + EJSON.stringify(subAndComp.args) + " --> " + EJSON.stringify(_subscriptionArgs), "(" + instance.view.name + ")");
										}
										if (!_.isEqual(subAndComp.args, _subscriptionArgs)) {
											instance.cachedSubscription.stopSub(id, false);
										} else {
											if (_debugMode) {
												console.log("[Cached Subscription] No argument change " + EJSON.stringify(subAndComp.args) + " --> " + EJSON.stringify(_subscriptionArgs) + "; Not doing anything." , "(" + instance.view.name + ")");
											}
											return;
										}
									}
									setTimeout(function startSubscriptionRoutine() {
										if (_debugMode) {
											console.log("[Cached Subscription] " + id + ": " + (c.firstRun ? "Starting" : "Restarting") + "...", EJSON.stringify(_subscriptionArgs), "(" + instance.view.name + ")");
										}
										if (_.isFunction(options.beforeStart)) {
											options.beforeStart(instance, id);
										}
										instance.cachedSubscription.__cachedSubscriptionIdx += 1;
										instance.cachedSubscription.__cachedSubscriptionId.set(id, instance.cachedSubscription.__cachedSubscriptionIdx);
										var sub = subsCache.subscribe.apply(subsCache, _subscriptionArgs);
										instance.cachedSubscription.__cachedSubscriptionsAllReady.set(instance.cachedSubscription.__cachedSubscriptionIdx);

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
								var subAndComp = instance.cachedSubscription.getSub(id);
								if (!subAndComp) {
									throw new Meteor.Error('no-started-sub-with-id');
								} else {
									if (_debugMode) {
										console.log("[Cached Subscription] " + id + ": Stopping...", EJSON.stringify(subAndComp.args), "(" + instance.view.name + ")");
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
										console.log("[Cached Subscription] " + id + ": Missing ready computation. (Args: " + EJSON.stringify(subAndComp.args) + ")", "(" + instance.view.name + ")");
									}
									instance.cachedSubscription.__cachedSubscriptionStarted[id] = false;
									if (_.isFunction(options.afterStop)) {
										options.afterStop(instance, id);
									}
								}
							},
							restartSub: function restartSub(id) {
								instance.cachedSubscription.stopSub(id);
								setTimeout(function initiateStartSub() {
									instance.cachedSubscription.startSub(id);
								}, 0);
							},
							cachedSubReady: function cachedSubReady(id) {
								return instance.cachedSubscription.getSub(id) && instance.cachedSubscription.getSub(id).sub.ready();
							},
							allCachedSubsReady: function allCachedSubsReady() {
								var isReady = (1 + instance.cachedSubscription.__cachedSubscriptionsAllReady.get()) > 0;
								var subsNameList = instance.cachedSubscription.__cachedSubscriptionList.get();
								subsNameList.forEach(function(id) {
									// evaluate everything
									// avoid short circuit evaluation to achieve proper reactivity
									isReady = instance.cachedSubscription.cachedSubReady(id) && isReady;
								});
								return isReady;
							},
							allSubsReady: function allSubsReady() {
								var allCachedSubsReady = instance.cachedSubscription.allCachedSubsReady();
								var templateLevelSubsReady = instance.subscriptionsReady();
								// avoid short circuit evaluation to achieve proper reactivity
								return allCachedSubsReady && templateLevelSubsReady;
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
					instance.cachedSubscription.startSub(subId);
				});

				template.onDestroyed(function tlsc_onDestroyed() {
					var instance = this;
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