/* global TemplateLevelSubsCache: true */
/* global createCachedSubscriptionInstance: true */
/* global DefaultSubscriptions: true */


var globalTemplateIndices = {};

createCachedSubscriptionInstance = function createCachedSubscriptionInstance(templateInstance, tlscInstance, subsCache) {
	var templateName = templateInstance.view.name;
	if (!_.isObject(globalTemplateIndices[templateName])) {
		globalTemplateIndices[templateName] = 0;
	}
	globalTemplateIndices[templateName] += 1;

	return {
		__templateInstanceId: globalTemplateIndices[templateName],
		__cachedSubscriptionIdx: 0,
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
			var _subIdx = templateInstance.cachedSubscription.__cachedSubscriptionId.get(id);
			var subInfo = templateInstance.cachedSubscription.__cachedSubscription[_subIdx];
			if (TemplateLevelSubsCache.DEBUG_MODE) {
				console.log(`[Cached Subscription]{${new Date()}} getSubInfo(${id}) --> idx: ${_subIdx} -->`, subInfo, `(${templateInstance.view.name}|${templateInstance.cachedSubscription.__templateInstanceId})`);
			}
			return subInfo;
		},
		getSub: function getSub(id) {
			var subInfo = templateInstance.cachedSubscription.getSubInfo(id);
			var sub = subInfo && subInfo.sub || null;
			if (TemplateLevelSubsCache.DEBUG_MODE) {
				console.log("[Cached Subscription]{" + (new Date()) + "} getSub(" + id + ") -->", sub, `(${templateInstance.view.name}|${templateInstance.cachedSubscription.__templateInstanceId})`);
			}
			return sub;
		},
		startSub: function startSub(id) {
			if (TemplateLevelSubsCache.DEBUG_MODE) {
				console.log("[Cached Subscription]{" + (new Date()) + "} Calling startSub(" + id + ")...", `(${templateInstance.view.name}|${templateInstance.cachedSubscription.__templateInstanceId})`);
			}

			var subOptions = templateInstance.cachedSubscription.__options[id];
			var tlscOptions = tlscInstance.options;

			if (!!templateInstance.cachedSubscription.__cachedSubscriptionStarted[id]) {
				throw new Meteor.Error("sub-already-started", id);
			}
			templateInstance.cachedSubscription.__cachedSubscriptionStarted[id] = true;

			templateInstance.autorun(function overallSubscriptionRoutine(c) {
				var _subscriptionArgs = templateInstance.cachedSubscription.__cachedSubscriptionArgs[id].map(x => _.isFunction(x) ? x(templateInstance) : x);
				if (!c.firstRun) {
					var subAndComp = templateInstance.cachedSubscription.getSubInfo(id);
					if (!subAndComp) {
						throw new Meteor.Error('unexpected-missing-subscription-info-for-existing-subscription', id);
					}
					if (TemplateLevelSubsCache.DEBUG_MODE) {
						console.log("[Cached Subscription]{" + (new Date()) + "} " + id + ": Stopping prior to restart. Argument change " + EJSON.stringify(subAndComp.args) + " --> " + EJSON.stringify(_subscriptionArgs), `(${templateInstance.view.name}|${templateInstance.cachedSubscription.__templateInstanceId})`);
					}
					if (!_.isEqual(subAndComp.args, _subscriptionArgs)) {
						templateInstance.cachedSubscription.stopSub(id, false);
					} else {
						if (TemplateLevelSubsCache.DEBUG_MODE) {
							console.log("[Cached Subscription]{" + (new Date()) + "} No argument change " + EJSON.stringify(subAndComp.args) + " --> " + EJSON.stringify(_subscriptionArgs) + "; Not doing anything.", `(${templateInstance.view.name}|${templateInstance.cachedSubscription.__templateInstanceId})`);
						}
						return;
					}
				}
				var isFirstRun = c.firstRun;
				setTimeout(function startSubscriptionRoutine() {
					if (TemplateLevelSubsCache.DEBUG_MODE) {
						console.log("[Cached Subscription]{" + (new Date()) + "} " + id + ": " + (isFirstRun ? "Starting" : "Restarting") + "...", EJSON.stringify(_subscriptionArgs), `(${templateInstance.view.name}|${templateInstance.cachedSubscription.__templateInstanceId})`);
					}

					// Before Start
					if (_.isFunction(subOptions.beforeStart)) {
						Tracker.nonreactive(function() {
							subOptions.beforeStart(templateInstance, id, _subscriptionArgs);
						});
					}
					if (TemplateLevelSubsCache.DEBUG_MODE) {
						console.log("[Cached Subscription]{" + (new Date()) + "} " + id + ": before start", `(${templateInstance.view.name}|${templateInstance.cachedSubscription.__templateInstanceId})`);
					}

					templateInstance.cachedSubscription.__cachedSubscriptionIdx += 1;

					var newIdx = templateInstance.cachedSubscription.__cachedSubscriptionIdx;
					templateInstance.cachedSubscription.__cachedSubscriptionId.set(id, newIdx);
					if (TemplateLevelSubsCache.DEBUG_MODE) {
						console.log(`[Cached Subscription]{${new Date()}} ${id} assigned sub-index ${newIdx} (${templateInstance.view.name}|${templateInstance.cachedSubscription.__templateInstanceId})`);
					}

					var sub;
					if (typeof tlscOptions.expireAfter === "number") {
						sub = subsCache.subscribeFor.apply(subsCache, [tlscOptions.expireAfter].concat(_subscriptionArgs));
					} else {
						sub = subsCache.subscribe.apply(subsCache, _subscriptionArgs);
					}

					templateInstance.cachedSubscription.__cachedSubscriptionsAllReady.set(newIdx);
					templateInstance.cachedSubscription.__cachedSubscriptionReady[newIdx] = new ReactiveVar(false);

					var csRecord = {
						sub: sub,
						computation: c,
						args: _subscriptionArgs,
						idx: newIdx,
						readyComputation: null,
					};
					templateInstance.cachedSubscription.__cachedSubscription[newIdx] = csRecord;
					setTimeout(function subReadyRoutine() {
						csRecord.readyComputation = templateInstance.autorun(function(c_r) {
							if (sub.ready()) {
								templateInstance.cachedSubscription.__cachedSubscriptionReady[newIdx].set(true);
								if (_.isFunction(subOptions.onReady)) {
									Tracker.nonreactive(function() {
										subOptions.onReady(templateInstance, id, _subscriptionArgs);
									});
								}
								if (TemplateLevelSubsCache.DEBUG_MODE) {
									console.log("[Cached Subscription]{" + (new Date()) + "} " + id + ": on ready", `(${templateInstance.view.name}|${templateInstance.cachedSubscription.__templateInstanceId})`);
								}
								c_r.stop();
							}
						});
					}, 0);

					// After Start
					if (_.isFunction(subOptions.afterStart)) {
						Tracker.nonreactive(function() {
							subOptions.afterStart(templateInstance, id, _subscriptionArgs);
						});
					}
					if (TemplateLevelSubsCache.DEBUG_MODE) {
						console.log("[Cached Subscription]{" + (new Date()) + "} " + id + ": after start", `(${templateInstance.view.name}|${templateInstance.cachedSubscription.__templateInstanceId})`);
					}
				}, 0);
			});
		},
		stopSub: function stopSub(id, stopOverallComputation = true) {
			var subAndComp = templateInstance.cachedSubscription.getSubInfo(id);
			var subOptions = templateInstance.cachedSubscription.__options[id];
			if (!subAndComp) {
				throw new Meteor.Error('no-started-sub-with-id', id);
			} else {
				if (TemplateLevelSubsCache.DEBUG_MODE) {
					console.log("[Cached Subscription]{" + (new Date()) + "} " + id + ": Stopping...", EJSON.stringify(subAndComp.args), `(${templateInstance.view.name}|${templateInstance.cachedSubscription.__templateInstanceId})`);
				}

				// Before Stop
				if (_.isFunction(subOptions.beforeStop)) {
					Tracker.nonreactive(function() {
						subOptions.beforeStop(templateInstance, id, subAndComp.args);
					});
				}
				if (TemplateLevelSubsCache.DEBUG_MODE) {
					console.log("[Cached Subscription]{" + (new Date()) + "} " + id + ": before stop", `(${templateInstance.view.name}|${templateInstance.cachedSubscription.__templateInstanceId})`);
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
							console.log("[Cached Subscription]{" + (new Date()) + "} " + id + ": Missing ready computation. (Args: " + EJSON.stringify(subAndComp.args) + ")", `(${templateInstance.view.name}|${templateInstance.cachedSubscription.__templateInstanceId})`);
						}
						templateInstance.cachedSubscription.__cachedSubscriptionStarted[id] = false;

						// After Stop
						if (_.isFunction(subOptions.afterStop)) {
							Tracker.nonreactive(function() {
								subOptions.afterStop(templateInstance, id, subAndComp.args);
							});
						}
						if (TemplateLevelSubsCache.DEBUG_MODE) {
							console.log("[Cached Subscription]{" + (new Date()) + "} " + id + ": after stop", `(${templateInstance.view.name}|${templateInstance.cachedSubscription.__templateInstanceId})`);
						}
						subAndComp.sub.stop();
						if (stopOverallComputation && !!subAndComp.computation && !subAndComp.computation.stopped) {
							subAndComp.computation.stop();
						}
						if (!!subAndComp.readyComputation) {
							subAndComp.readyComputation.stop();
						} else {
							console.log("[Cached Subscription]{" + (new Date()) + "} " + id + ": Missing ready computation. (Args: " + EJSON.stringify(subAndComp.args) + ")", `(${templateInstance.view.name}|${templateInstance.cachedSubscription.__templateInstanceId})`);
						}
						templateInstance.cachedSubscription.__cachedSubscriptionStarted[id] = false;

						// After Stop
						if (_.isFunction(subOptions.afterStop)) {
							Tracker.nonreactive(function() {
								subOptions.afterStop(templateInstance, id, subAndComp.args);
							});
						}
						if (TemplateLevelSubsCache.DEBUG_MODE) {
							console.log("[Cached Subscription]{" + (new Date()) + "} " + id + ": after stop", `(${templateInstance.view.name}|${templateInstance.cachedSubscription.__templateInstanceId})`);
						}

						c.stop();
					} else {
						Meteor.setTimeout(function stopComputationAfterTimeoutIfNotStopped() {
							if (!c.stopped) {
								if (TemplateLevelSubsCache.DEBUG_MODE) {
									console.log("[Cached Subscription]{" + (new Date()) + "} " + id + ": force stopping computation; sub was never ready", `(${templateInstance.view.name}|${templateInstance.cachedSubscription.__templateInstanceId})`);
								}
								c.stop();
							}
						}, 1000 * 60 * 10);  // 10 min
					}
				});
			}
		},
		restartSub: function restartSub(id) {
			if (TemplateLevelSubsCache.DEBUG_MODE) {
				console.log("[Cached Subscription]{" + (new Date()) + "} Calling restartSub(" + id + ")...", `(${templateInstance.view.name}|${templateInstance.cachedSubscription.__templateInstanceId})`);
			}
			templateInstance.cachedSubscription.stopSub(id);
			setTimeout(function initiateStartSub() {
				templateInstance.cachedSubscription.startSub(id);
			}, 0);
		},
		cachedSubReady: function cachedSubReady(id) {
			var idx = templateInstance.cachedSubscription.__cachedSubscriptionId.get(id);
			var result;
			if (typeof idx !== "undefined") {
				result = templateInstance.cachedSubscription.__cachedSubscriptionReady[idx].get();
			} else {
				result = false;
			}
			if (TemplateLevelSubsCache.DEBUG_MODE) {
				console.log("[Cached Subscription]{" + (new Date()) + "} cachedSubReady(" + id + ") --> " + result, `(${templateInstance.view.name}|${templateInstance.cachedSubscription.__templateInstanceId})`);
			}
			return result;
		},
		allCachedSubsReady: function allCachedSubsReady() {
			var isReady = !!templateInstance.cachedSubscription.__cachedSubscriptionsAllReady.get();
			var subsNameList = templateInstance.cachedSubscription.__cachedSubscriptionList.get();
			subsNameList.forEach(function(id) {
				// evaluate everything
				// avoid short circuit evaluation to achieve proper reactivity
				isReady = templateInstance.cachedSubscription.cachedSubReady(id) && isReady;
			});
			if (TemplateLevelSubsCache.DEBUG_MODE) {
				console.log("[Cached Subscription]{" + (new Date()) + "} allCachedSubsReady() --> " + isReady, `(${templateInstance.view.name}|${templateInstance.cachedSubscription.__templateInstanceId})`);
			}
			return isReady;
		},
		allSubsReady: function allSubsReady() {
			var allCachedSubsReady = templateInstance.cachedSubscription.allCachedSubsReady();
			var templateLevelSubsReady = templateInstance.subscriptionsReady();
			var defaultSubsReady = DefaultSubscriptions.allReady();
			// avoid short circuit evaluation to achieve proper reactivity
			var isReady = allCachedSubsReady && templateLevelSubsReady && defaultSubsReady;
			if (TemplateLevelSubsCache.DEBUG_MODE) {
				console.log("[Cached Subscription]{" + (new Date()) + "} allSubsReady() --> " + isReady, `(${templateInstance.view.name}|${templateInstance.cachedSubscription.__templateInstanceId})`);
			}
			return isReady;
		},
	};
};