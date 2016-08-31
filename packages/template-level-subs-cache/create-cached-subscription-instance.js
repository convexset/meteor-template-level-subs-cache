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

	const __original_subscriptionsReady = templateInstance.subscriptionsReady;

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
				TemplateLevelSubsCache.LOG(`[Cached Subscription]{${new Date()}} getSubInfo(${id}) --> idx: ${_subIdx} -->`, subInfo, `(${templateInstance.view.name}|${templateInstance.cachedSubscription.__templateInstanceId})`);
			}
			return subInfo;
		},
		getSub: function getSub(id) {
			var subInfo = templateInstance.cachedSubscription.getSubInfo(id);
			var sub = subInfo && subInfo.sub || null;
			if (TemplateLevelSubsCache.DEBUG_MODE) {
				TemplateLevelSubsCache.LOG("[Cached Subscription]{" + (new Date()) + "} getSub(" + id + ") -->", sub, `(${templateInstance.view.name}|${templateInstance.cachedSubscription.__templateInstanceId})`);
			}
			return sub;
		},
		startSub: function startSub(id) {
			if (TemplateLevelSubsCache.DEBUG_MODE) {
				TemplateLevelSubsCache.LOG("[Cached Subscription]{" + (new Date()) + "} Calling startSub(" + id + ")...", `(${templateInstance.view.name}|${templateInstance.cachedSubscription.__templateInstanceId})`);
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
						TemplateLevelSubsCache.LOG("[Cached Subscription]{" + (new Date()) + "} " + id + ": Stopping prior to restart. Argument change " + EJSON.stringify(subAndComp.args) + " --> " + EJSON.stringify(_subscriptionArgs), `(${templateInstance.view.name}|${templateInstance.cachedSubscription.__templateInstanceId})`);
					}
					if (!_.isEqual(subAndComp.args, _subscriptionArgs)) {
						templateInstance.cachedSubscription.stopSub(id, false);
					} else {
						if (TemplateLevelSubsCache.DEBUG_MODE) {
							TemplateLevelSubsCache.LOG("[Cached Subscription]{" + (new Date()) + "} No argument change " + EJSON.stringify(subAndComp.args) + " --> " + EJSON.stringify(_subscriptionArgs) + "; Not doing anything.", `(${templateInstance.view.name}|${templateInstance.cachedSubscription.__templateInstanceId})`);
						}
						return;
					}
				}
				var isFirstRun = c.firstRun;

				// start subscription routine				
				if (TemplateLevelSubsCache.DEBUG_MODE) {
					TemplateLevelSubsCache.LOG("[Cached Subscription]{" + (new Date()) + "} " + id + ": " + (isFirstRun ? "Starting" : "Restarting") + "...", EJSON.stringify(_subscriptionArgs), `(${templateInstance.view.name}|${templateInstance.cachedSubscription.__templateInstanceId})`);
				}

				var proceedWithSub = subOptions.argValidityPredicate.apply(templateInstance, _subscriptionArgs);
				if (!proceedWithSub && TemplateLevelSubsCache.DEBUG_MODE) {
					TemplateLevelSubsCache.LOG("[Cached Subscription]{" + (new Date()) + "} " + id + ": arguments not valid => not subscribing to publication", `(${templateInstance.view.name}|${templateInstance.cachedSubscription.__templateInstanceId})`);
				}

				// Before Start
				if (proceedWithSub && _.isFunction(subOptions.beforeStart)) {
					Tracker.nonreactive(function() {
						subOptions.beforeStart(templateInstance, id, _subscriptionArgs);
					});
				}
				if (proceedWithSub && TemplateLevelSubsCache.DEBUG_MODE) {
					TemplateLevelSubsCache.LOG("[Cached Subscription]{" + (new Date()) + "} " + id + ": before start", `(${templateInstance.view.name}|${templateInstance.cachedSubscription.__templateInstanceId})`);
				}

				templateInstance.cachedSubscription.__cachedSubscriptionIdx += 1;

				var newIdx = templateInstance.cachedSubscription.__cachedSubscriptionIdx;
				templateInstance.cachedSubscription.__cachedSubscriptionId.set(id, newIdx);
				if (proceedWithSub && TemplateLevelSubsCache.DEBUG_MODE) {
					TemplateLevelSubsCache.LOG(`[Cached Subscription]{${new Date()}} ${id} assigned sub-index ${newIdx} (${templateInstance.view.name}|${templateInstance.cachedSubscription.__templateInstanceId})`);
				}

				templateInstance.cachedSubscription.__cachedSubscriptionsAllReady.set(newIdx);
				templateInstance.cachedSubscription.__cachedSubscriptionReady[newIdx] = new ReactiveVar(false);

				var sub;
				var csRecord = {
					sub: null,
					computation: c,
					args: _subscriptionArgs,
					idx: newIdx,
					readyComputation: null,
				};
				templateInstance.cachedSubscription.__cachedSubscription[newIdx] = csRecord;

				csRecord.startSubPromise = new Promise(function(resolve) {
					setTimeout(function doActualSubscription() {
						/* 
						 * some stuff might be happening in ccorcos:subs-cache
						 * in stop and it has to be resolved before starting,
						 * but we can't do it within a autorun block. Hence, the
						 * setTimeout. And to guard against stopping a sub that
						 * has not yet started, we put things in a promise and
						 * chain stopSub to the resolution of this promise
						 */
						Tracker.flush();

						if (proceedWithSub) {
							if (typeof tlscOptions.expireAfter === "number") {
								sub = subsCache.subscribeFor.apply(subsCache, [tlscOptions.expireAfter].concat(_subscriptionArgs));
							} else {
								sub = subsCache.subscribe.apply(subsCache, _subscriptionArgs);
							}
						} else {
							// fake sub that is immediately ready and can be stopped
							sub = {
								ready: () => true,
								stop: () => void 0,
								isFake: true
							};
						}

						csRecord.sub = sub;
						csRecord.readyComputation = templateInstance.autorun(function(c_r) {
							if (sub.ready()) {
								templateInstance.cachedSubscription.__cachedSubscriptionReady[newIdx].set(true);
								if (_.isFunction(subOptions.onReady)) {
									Tracker.nonreactive(function() {
										subOptions.onReady(templateInstance, id, _subscriptionArgs);
									});
								}
								if (TemplateLevelSubsCache.DEBUG_MODE) {
									TemplateLevelSubsCache.LOG("[Cached Subscription]{" + (new Date()) + "} " + id + ": on ready", `(${templateInstance.view.name}|${templateInstance.cachedSubscription.__templateInstanceId})`);
								}
								c_r.stop();
							}
						});

						// After Start
						if (proceedWithSub && _.isFunction(subOptions.afterStart)) {
							Tracker.nonreactive(function() {
								subOptions.afterStart(templateInstance, id, _subscriptionArgs);
							});
						}
						if (proceedWithSub && TemplateLevelSubsCache.DEBUG_MODE) {
							TemplateLevelSubsCache.LOG("[Cached Subscription]{" + (new Date()) + "} " + id + ": after start", `(${templateInstance.view.name}|${templateInstance.cachedSubscription.__templateInstanceId})`);
						}

						resolve(true);
					}, 0);
				});

			});
		},
		stopSub: function stopSub(id, stopOverallComputation = true) {
			return new Promise(function stopSubPromise(resolve) {
				var subAndComp = templateInstance.cachedSubscription.getSubInfo(id);
				var subOptions = templateInstance.cachedSubscription.__options[id];
				if (!subAndComp) {
					throw new Meteor.Error('no-started-sub-with-id', id);
				} else {
					// ensure that start-sub work completes before stopping it
					subAndComp.startSubPromise.then(function stopSubAfterStartCompletes() {

						if (!subAndComp.sub.isFake) {
							if (TemplateLevelSubsCache.DEBUG_MODE) {
								TemplateLevelSubsCache.LOG("[Cached Subscription]{" + (new Date()) + "} " + id + ": Stopping...", EJSON.stringify(subAndComp.args), `(${templateInstance.view.name}|${templateInstance.cachedSubscription.__templateInstanceId})`);
							}

							// Before Stop
							if (_.isFunction(subOptions.beforeStop)) {
								Tracker.nonreactive(function() {
									subOptions.beforeStop(templateInstance, id, subAndComp.args);
								});
							}
							if (TemplateLevelSubsCache.DEBUG_MODE) {
								TemplateLevelSubsCache.LOG("[Cached Subscription]{" + (new Date()) + "} " + id + ": before stop", `(${templateInstance.view.name}|${templateInstance.cachedSubscription.__templateInstanceId})`);
							}
						}

						// Stop everything
						subAndComp.sub.stop();
						if (stopOverallComputation && !!subAndComp.computation && !subAndComp.computation.stopped) {
							subAndComp.computation.stop();
						}
						if (!!subAndComp.readyComputation) {
							subAndComp.readyComputation.stop();
						} else {
							TemplateLevelSubsCache.LOG("[Cached Subscription]{" + (new Date()) + "} " + id + ": Missing ready computation. (Args: " + EJSON.stringify(subAndComp.args) + ")", `(${templateInstance.view.name}|${templateInstance.cachedSubscription.__templateInstanceId})`);
						}
						templateInstance.cachedSubscription.__cachedSubscriptionStarted[id] = false;

						if (!subAndComp.sub.isFake) {
							// After Stop
							if (_.isFunction(subOptions.afterStop)) {
								Tracker.nonreactive(function() {
									subOptions.afterStop(templateInstance, id, subAndComp.args);
								});
							}
							if (TemplateLevelSubsCache.DEBUG_MODE) {
								TemplateLevelSubsCache.LOG("[Cached Subscription]{" + (new Date()) + "} " + id + ": after stop", `(${templateInstance.view.name}|${templateInstance.cachedSubscription.__templateInstanceId})`);
							}
						}

						resolve(true);
					});
				}
			});
		},
		restartSub: function restartSub(id) {
			if (TemplateLevelSubsCache.DEBUG_MODE) {
				TemplateLevelSubsCache.LOG("[Cached Subscription]{" + (new Date()) + "} Calling restartSub(" + id + ")...", `(${templateInstance.view.name}|${templateInstance.cachedSubscription.__templateInstanceId})`);
			}
			templateInstance.cachedSubscription
				.stopSub(id)
				.then(function() {
					Tracker.flush(); // let things unravel first (we have time...)
					templateInstance.cachedSubscription.startSub(id);
				});
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
				TemplateLevelSubsCache.LOG("[Cached Subscription]{" + (new Date()) + "} cachedSubReady(" + id + ") --> " + result, `(${templateInstance.view.name}|${templateInstance.cachedSubscription.__templateInstanceId})`);
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
				TemplateLevelSubsCache.LOG("[Cached Subscription]{" + (new Date()) + "} allCachedSubsReady() --> " + isReady, `(${templateInstance.view.name}|${templateInstance.cachedSubscription.__templateInstanceId})`);
			}
			return isReady;
		},
		allSubsReady: function allSubsReady() {
			var allCachedSubsReady = templateInstance.cachedSubscription.allCachedSubsReady();
			var templateLevelSubsReady = __original_subscriptionsReady.call(templateInstance);
			var defaultSubsReady = DefaultSubscriptions.allReady();
			// avoid short circuit evaluation to achieve proper reactivity
			var isReady = allCachedSubsReady && templateLevelSubsReady && defaultSubsReady;
			if (TemplateLevelSubsCache.DEBUG_MODE) {
				TemplateLevelSubsCache.LOG("[Cached Subscription]{" + (new Date()) + "} allSubsReady() --> " + isReady, `(${templateInstance.view.name}|${templateInstance.cachedSubscription.__templateInstanceId})`);
			}
			return isReady;
		},
	};
};