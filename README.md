# TemplateLevelSubsCache

`TemplateLevelSubsCache` is a subscriptions cache that works at a "template-level". Meaning that cached subscriptions behave like [template-level subscriptions](http://docs.meteor.com/#/full/Blaze-TemplateInstance-subscribe) wherein subscriptions are started `onCreated` or `onRendered`.

Subscription arguments can be functions that are evaluated when the subscription is started. Furthermore, they may also be reactive data sources, allowing the realization of "self-rolled" reactive joins.

The example in the [linked GitHub repository](https://github.com/convexset/meteor-template-level-subs-cache) provides an demonstration of such a client-side join.

## Table of Contents

- [Install](#install)
- [Usage](#usage)
  - [Step 1: Create a Cache](#step-1-create-a-cache)
  - [Step 2: Prepare Templates](#step-2-prepare-templates)
    - [Simple Arguments](#simple-arguments)
    - [Reactive Arguments](#reactive-arguments)
    - [Additional Options](#additional-options)
  - [Template Helpers](#template-helpers)
  - [Functionality on Template Instances](#functionality-on-template-instances)
  - [Debug Mode](#debug-mode)
- [Notes](#notes)

## Install

This is available as [`convexset:template-level-subs-cache`](https://atmospherejs.com/convexset/template-level-subs-cache) on [Atmosphere](https://atmospherejs.com/). (Install with `meteor add convexset:template-level-subs-cache`.)

## Usage

### Step 1: Create a Cache

Cache elements are removed only after configurable time interval (`expireAfter`; stated in minutes) reducing database load when repeatedly starting and stopping the same subscription within a short period of time (within `expireAfter` minutes). If set to -1, subscriptions will never expire (set this with caution).

Caches have a configurable capacity (`cacheLimit`) to limit the maximum number of subscriptions in the cache (default: -1 for unlimited capacity).

So...

```javascript
    var TLSC = TemplateLevelSubsCache.makeCache({
        startOnCreated: true,
        expireAfter: 2,  // 2 minutes
        cacheLimit: -1,  // unlimited capacity
    });
```

(`TemplateLevelSubsCache` rides atop [`ccorcos:subs-cache`](https://atmospherejs.com/ccorcos/subs-cache) uses instances of that internally.)


### Step 2: Prepare Templates

There are a few ways to prepare templates. (Also, yes, multiple cached subscriptions can be prepared on the same template, even with different caches.)

#### Simple Arguments

Here is the simplest form:

```javascript
TLSC.prepareCachedSubscription(
    Template.SomeTemplate,
    'unique-id-of-publication-on-template',
    ['publication-name', arg1, arg2, arg3, ...]
);
```

Alternatively, the first argument can be replaced with an array of templates that use the same subscription:

```javascript
TLSC.prepareCachedSubscription(
    [Template.SomeTemplate, Template.SomeOtherTemplate],
    'unique-id-of-publication-on-template',
    ['publication-name', arg1, arg2, arg3, ...]
);
```

Also, the subscriptions arguments, can be as specified as functions:

```javascript
TLSC.prepareCachedSubscription(
    Template.NewsToday,
    'the-news-today',
    ['front-page-news-on', () => new Date()]
);
```

... or ...

```javascript
TLSC.prepareCachedSubscription(
    Template.NewsToday,
    'the-news-today',
    ['front-page-news-on', () => myRouter.getParam('itemId'), () => new Date()]
);
```

... also, they may take the template instance as a parameter...

TLSC.prepareCachedSubscription(
    Template.NewsToday,
    'the-news-today',
    [
        'front-page-news-on', () => myRouter.getParam('itemId'),
        () => new Date(),
        (instance) => instance.numArticlesPerPage
    ]
);
```

... actually, that last parameter should be reactive, which leads us to the next section.

#### Reactive Arguments

Arguments can be reactive as well.

```javascript
TLSC.prepareCachedSubscription(
    Template.SomeTemplate,
    'some-reactive-subscription',
    ['some-reactive-subscription', () => Meteor.userId(), (instance) => instance.someReactiveVar.get()]
);
```

#### Additional Options

For those with a touch of OCD, each subscription may be "prepared" in with more options:
 - `startOnCreated`: determines when the subscription starts (`onCreated` if `true` or `onRendered` if `false`) (default: `true`)
 - `expireAfter`: provide an `expireAfter` value for a particular subscription (default: use pre-specified value)
 - `beforeStart`: a callback function that is called before the subscription is started
 - `afterStart`: a callback function that is called after the subscription is started
 - `onReady`: a callback function that is called after the subscription is ready
 - `beforeStop`: a callback function that is called before the subscription is stopped
 - `afterStop`: a callback function that is called after the subscription is stopped

Each of the above callbacks is called with the template instance and subscription id as arguments.

Here is an example:

```javascript
TLSC.prepareCachedSubscription(
    Template.SomeTemplate,
    'some-reactive-subscription',
    ['some-reactive-subscription', () => Meteor.userId(), (instance) => instance.someReactiveVar.get()],
    {
        startOnCreated: true,
        beforeStart: (instance, id) => console.log('beforeStart', id),
        afterStart: (instance, id) => console.log('afterStart', id),
        onReady: (instance, id) => console.log('onReady', id),
        beforeStop: (instance, id) => console.log('beforeStop', id),
        afterStop: (instance, id) => console.log('afterStop', id),
    }
);
```

### Template Helpers

A number of helpers are added to the associated template
 - `cachedSubReady`: maps the id of a subscription to whether it is currently ready
 - `allCachedSubsReady`: reports whether all cached subscriptions are ready
 - `allSubsReady`: reports whether all cached subscriptions and template-level subscriptions are ready

### Functionality on Template Instances

Given a template instance `templateInstance` with a cached subscription defined, a property `cachedSubscription` is appended onto it.

 - `templateInstance.cachedSubscription.cachedSubReady(id)`: maps the id of a subscription to whether it is currently ready
 - `templateInstance.cachedSubscription.allCachedSubsReady()`: reports whether all cached subscriptions are ready
 - `templateInstance.cachedSubscription.allSubsReady()`: reports whether all cached subscriptions and template-level subscriptions are ready

There is additional functionality, but it should not be necessary to use them directly.

 - `templateInstance.cachedSubscription.getSubInfo(id)`
 - `templateInstance.cachedSubscription.getSub(id)`
 - `templateInstance.cachedSubscription.startSub(id)`
 - `templateInstance.cachedSubscription.stopSub(id, stopOverallComputation = true)`
 - `templateInstance.cachedSubscription.restartSub(id)`

## Debug Mode

Set `TemplateLevelSubsCache.DEBUG_MODE` to `true` to turn on debug messages.

## Notes

If there is the need for functionality to remove a subscription from the cache immediately, please raise an issue. Presently, there seems to be no practical need for that functionality.