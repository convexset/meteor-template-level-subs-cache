# TemplateLevelSubsCache

`TemplateLevelSubsCache` is a subscriptions cache that works at a "template-level". Meaning that cached subscriptions behave like [template-level subscriptions](http://docs.meteor.com/#/full/Blaze-TemplateInstance-subscribe) wherein subscriptions are started `onCreated` or `onRendered`.

Subscription arguments can be functions that are evaluated when the subscription is started. Furthermore, they may also be reactive data sources, allowing the realization of "self-rolled" reactive joins.

The example in the [linked GitHub repository](https://github.com/convexset/meteor-template-level-subs-cache) provides an demonstration of such a client-side join.

Additional tools are provided in the form of:
 - [`DefaultSubscriptions`](#defaultsubscriptions): A tool for describing publications which should be subscribed to throughout the application
 - [`_EnsureIndexes`](#_EnsureIndexes): A development tool for ensuring the existence of indexes/indices for Mongo collections
 - [The Information Bundler](#the-information-bundler-enhancement): A tool for not reducing repeated code in specifying the information requirements of templates

## Table of Contents

<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->


- [Install](#install)
- [Usage](#usage)
  - [Step 1: Create a Cache](#step-1-create-a-cache)
  - [Step 2: Prepare Templates](#step-2-prepare-templates)
    - [Simple Arguments](#simple-arguments)
    - [Reactive Arguments](#reactive-arguments)
    - [Additional Options](#additional-options)
  - [The Information Bundler Enhancement](#the-information-bundler-enhancement)
    - [Why](#why)
    - [Using It](#using-it)
  - [Template Helpers](#template-helpers)
  - [Functionality on Template Instances](#functionality-on-template-instances)
- [Debug Mode](#debug-mode)
- [Other Tools](#other-tools)
  - [`DefaultSubscriptions`](#defaultsubscriptions)
  - [`_EnsureIndexes` (Server Only, Naturally)](#_ensureindexes-server-only-naturally)
  - [Decorators (in JavaScript and Blaze)](#decorators-in-javascript-and-blaze)
- [Notes](#notes)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

## Install

This is available as [`convexset:template-level-subs-cache`](https://atmospherejs.com/convexset/template-level-subs-cache) on [Atmosphere](https://atmospherejs.com/). (Install with `meteor add convexset:template-level-subs-cache`.)

If you get an error message like:
```
WARNING: npm peer requirements not installed:
 - package-utils@^0.2.1 not installed.
          
Read more about installing npm peer dependencies:
  http://guide.meteor.com/using-packages.html#peer-npm-dependencies
```
It is because, by design, the package does not include instances of these from `npm` to avoid repetition. (In this case, `meteor npm install --save package-utils` will deal with the problem.)

See [this](http://guide.meteor.com/using-packages.html#peer-npm-dependencies) or [this](https://atmospherejs.com/tmeasday/check-npm-versions) for more information.

Now, if you see a message like
```
WARNING: npm peer requirements not installed:
underscore@1.5.2 installed, underscore@^1.8.3 needed
```
it is because you or something you are using is using Meteor's cruddy old `underscore` package. Install a new version from `npm`. (And, of course, you may use the `npm` version in a given scope via `require("underscore")`.)


## Usage

### Step 1: Create a Cache

Cache elements are removed only after configurable time interval (`expireAfter`; stated in minutes) reducing database load when repeatedly starting and stopping the same subscription within a short period of time (within `expireAfter` minutes). If set to -1, subscriptions will never expire (set this with caution).

Caches have a configurable capacity (`cacheLimit`) to limit the maximum number of subscriptions in the cache (default: -1 for unlimited capacity).

So...

```javascript
var TLSC = TemplateLevelSubsCache.makeCache({
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

```
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

... actually, that last parameter should, instead of being a function without a a reactive dependency, be a function with a reactive dependency. Something on the template instance might change `numArticlesPerPage` (the number of articles to display per page?) that necessitates a change in the subscription's parameters. This leads us to the next section.

#### Reactive Arguments

Arguments can be reactive as well.

```javascript
TLSC.prepareCachedSubscription(
    Template.SomeTemplate,
    'some-reactive-subscription',
    ['some-reactive-subscription', () => Meteor.userId(), (instance) => instance.someReactiveVar.get()]
);
```

Often one uses a router with reactive facilities for getting parameters. For example, `() => FlowRouter.getParam("itemId")` might use used as a subscription argument. The same is achieved via:
```javascript
TemplateLevelSubsCache.ReactiveParamGetter.fromName("itemId", FlowRouter.getParam.bind(FlowRouter))
```

It's a bit verbose, but... Perhaps the more general suite of tools it is part of might help.
 - TemplateLevelSubsCache.ReactiveParamGetter.fromName(name, ReactiveParamGetter)
   - Generates: `() => ReactiveParamGetter(name)`
 - TemplateLevelSubsCache.ReactiveParamGetter.fromArrayToArray("itemId", ReactiveParamGetter)
   - Takes an array of names and maps it to an array of reactive functions like `() => ReactiveParamGetter(name)`
   - e.g.: `['x', 'y']` maps to `[ReactiveParamGetter('x'), ReactiveParamGetter('y')]`
 - TemplateLevelSubsCache.ReactiveParamGetter.fromArrayToObj("itemId", ReactiveParamGetter)
   - Takes an array of names and maps it to object where the keys are the names, and the values are functions like `() => ReactiveParamGetter(name)`
   - e.g.: `['x', 'y']` maps to `{x: ReactiveParamGetter('x'), y: ReactiveParamGetter('y')}`
 - TemplateLevelSubsCache.ReactiveParamGetter.fromObjToObj("itemId", ReactiveParamGetter)
   - Takes an object where the values are names and maps it to object where the values become functions like `() => ReactiveParamGetter(name)`
   - e.g.: `{a: 'x', b: 'y'}` maps to `{a: ReactiveParamGetter('x'), b: ReactiveParamGetter('y')}`


Note: with `FlowRouter`, `FlowRouter.getParam` is a prototype method and should be bound to `FlowRouter` before it is passed in.

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
    ['some-reactive-subscription', () => Meteor.userId(), instance => instance.someReactiveVar.get()],
    {
        startOnCreated: true,
        beforeStart: (instance, id, currentArgs) => console.log('beforeStart', id, currentArgs),
        afterStart: (instance, id, currentArgs) => console.log('afterStart', id, currentArgs),
        onReady: (instance, id, currentArgs) => console.log('onReady', id, currentArgs),
        beforeStop: (instance, id, currentArgs) => console.log('beforeStop', id, currentArgs),
        afterStop: (instance, id, currentArgs) => console.log('afterStop', id, currentArgs),
    }
);
```

### The Information Bundler Enhancement

#### Why

Consider the following case:
 - One has three collections in one's app: `"customers"`, `"items"`, `"purchases"`
 - `"customers"` is associated with a certain publication and some helpers (H:C)
 - `"items"` is associated with a certain publication and some helpers (H:I)
 - `"purchases"` is associated with a certain publication and some helpers (H:P)
 - On templates using data from `"customers"` and `"purchases"`, some additional helpers (H:CP) may be used
 - On templates using data from `"items"` and `"purchases"`, other additional helpers (H:IP) may be used
 - On templates using data from all three, yet other additional helpers (H:CIP) may be used

There are a number of templates requiring data from various combinations of the three and it would be good to reduce repetitions in code.

The `InformationBundler` helps through the following:
 - Describe base information bundles
 - Associate base information bundles with publications (through subscriptions; zero or more)
 - Describe the additional resources available when combinations of information bundles are available
 - Automate the set-up for templates given the names of the required information bundles

Let's be specific:
 - Base Information Bundles:
   - `"ib-customers"` with helpers `{getCustomerById, allCustomers}`
   - `"ib-items"` with helpers `{getItemById, allItems}`
   - `"ib-purchases"` with helpers `{getPurchaseById, allPurchases}`
 - Associated Subscriptions:
   - `"ib-customers"` (say a subscription subscribing, possibly reactively, to a publication of `"customers"`)
   - `"ib-items"` (say a subscription subscribing, possibly reactively, to a publication of `"items"`)
   - `"ib-purchases"` (say a subscription subscribing, possibly reactively, to a publication of `"purchases"`)
 - Supplementary Information Bundles:
   - `["ib-customers", "ib-purchases"]` with helpers `{customerPurchasesJoin}`
   - `["ib-items", "ib-purchases"]` with helpers `{itemPurchasesJoin}`
   - `["ib-customers", "ib-customers", "ib-purchases"]` with helpers `{customerItemPurchasesJoin}`

So a template using bundle `"ib-customers"` would use:
 - a subscription to `"customers"`
 - helpers `{getCustomerById, allCustomers}`

And template using bundles `["ib-customers", "ib-items"]` would use:
 - a subscription to `"customers"`
 - a subscription to `"items"`
 - helpers `{getCustomerById, allCustomers, getItemById, allItems}`

And template using bundles `["ib-customers", "ib-purchases"]` would use:
 - a subscription to `"customers"`
 - a subscription to `"purchases"`
 - helpers `{getCustomerById, allCustomers, getPurchaseById, allPurchases, customerPurchasesJoin}`

Note that after specifying the bundles, all that is needed to prepare a template is just the bundle names.

#### Usage by Example

As mentioned, the steps involved are:
 - Describe base information bundles
```javascript
InformationBundler.addBasicInformationBundle({
    bundleName: "customers",
    helpers: {
        getCustomerById: _id => CustomerCollection.findOne({_id: _id}),
        allCustomers: () => CustomerCollection.find()
    },
    // Calling this again with the same name and different helpers will add
    // more helpers rather than replace all of them. A warning will also be
    // issued. To suppress the warning, set
    // knownExtension: true 
    // (it defaults to false)
});

InformationBundler.addBasicInformationBundle({/* for "items" */});
InformationBundler.addBasicInformationBundle({/* for "purchases" */});
```
 - Associate base information bundles with publications (through subscriptions; zero or more; the first argument of `InformationBundler.associateSubscription` is the name of the bundle, and the rest are [those of TLSC.prepareCachedSubscription in the same sequence](#step-2-prepare-templates))
```javascript
if (Meteor.isServer) {
    Meteor.publish("all-customers", () => CustomerCollection.find());
    Meteor.publish("all-items", () => ItemCollection.find());
    Meteor.publish("all-purchases", () => PurchaseRecordCollection.find());
}

if (Meteor.isClient) {
    InformationBundler.associateSubscription({
        bundleName: "customers",             // the bundle name
        subName: "customers-sub",            // just a name that should be unique for all cached subs
                                             // to be placed on a template
        subscriptionArgs: ["all-customers"], // publication name and then arguments
        options: {                           // the options as asked for in TLSC.prepareCachedSubscription
            startOnCreated: true,
            beforeStart: (instance, id, currentArgs) => console.log('beforeStart', id, currentArgs),
            afterStart: (instance, id, currentArgs) => console.log('afterStart', id, currentArgs),
            onReady: (instance, id, currentArgs) => console.log('onReady', id, currentArgs),
            beforeStop: (instance, id, currentArgs) => console.log('beforeStop', id, currentArgs),
            afterStop: (instance, id, currentArgs) => console.log('afterStop', id, currentArgs),
        }
    });

    InformationBundler.associateSubscription({/* for items */});
    InformationBundler.associateSubscription({/* for purchases */});
}
```
 - Describe the additional resources available when combinations of information bundles are available
```javascript
InformationBundler.addSupplementaryInformationBundle({
    bundleNames: ["customers", "purchases"],
    helpers: {
        customerPurchasesJoin: _id => PurchaseRecordCollection.map(pr => _.extend({
            customer: CustomerCollection.findOne({_id: pr.customerId})
        }, pr))
    }
});

// and others...
```
 - Note that `InformationBundler.addGeneralInformationBundle` is a single argument function that calls `InformationBundler.addSupplementaryInformationBundle` with `bundleNames` set to `[]`, meaning that every time a template is set-up using `InformationBundler`, all helpers passed will be added.
```
// These are identical
InformationBundler.addGeneralInformationBundle({
    someHelper: someHelper
});

InformationBundler.addSupplementaryInformationBundle({
    bundleNames: [],
    helpers: {
        someHelper: someHelper
    }
});
```
 - Automate the set-up for templates given the names of the required information bundles (given a `TemplateLevelSubsCache` instance `TLSCInstance` from [here](#step-1-create-a-cache))
```javascript
InformationBundler.prepareTemplates({
    cache: cache,
    templates: [PurchaseDetailsGroupedByCustomer, OtherTemplate],  // or just Template3 if there is only one
    bundleNames: ["customers", "items", "purchases"]
});
```
 - Feel the cleanliness of your code
 - To find out which subscriptions (as array of object in the form of `{name: ..., subscriptionArgs: ..., options: ...}`) are used with a list of bundles, call `InformationBundler.subscriptionsUsed(arrayOfBundleNames)`
 - To find out which helpers (as object where they keys are helper names and the values helpers) are used with a list of bundles, call `InformationBundler.helpersUsed(arrayOfBundleNames)`

### Template Helpers

A number of helpers are added to the associated template
 - `cachedSubReady`: maps the id of a subscription to whether it is currently ready
 - `allCachedSubsReady`: reports whether all cached subscriptions are ready
 - `allSubsReady`: reports whether all cached subscriptions, template-level subscriptions and ["default subscriptions"](#defaultsubscriptions) are ready; this helper is added globally, and if a template is not configured for cached subscriptions, only the latter two are checked

### Functionality on Template Instances

Given a template instance `templateInstance` with a cached subscription defined, a property `cachedSubscription` is appended onto it.

 - `templateInstance.cachedSubscription.cachedSubReady(id)`: maps the id of a subscription to whether it is currently ready
 - `templateInstance.cachedSubscription.allCachedSubsReady()`: reports whether all cached subscriptions are ready
 - `templateInstance.cachedSubscription.allSubsReady()`: reports whether all cached subscriptions, template-level subscriptions and ["default subscriptions"](#defaultsubscriptions) are ready

There is additional functionality, but it should not be necessary to use them directly.

 - `templateInstance.cachedSubscription.getSubInfo(id)`
 - `templateInstance.cachedSubscription.getSub(id)`
 - `templateInstance.cachedSubscription.startSub(id)`
 - `templateInstance.cachedSubscription.stopSub(id, stopOverallComputation = true)`
 - `templateInstance.cachedSubscription.restartSub(id)`

## Debug Mode

Set `TemplateLevelSubsCache.DEBUG_MODE` to `true` to turn on debug messages.

## Other Tools

### `DefaultSubscriptions`

`DefaultSubscriptions` provides functionality for publications and subscriptions that should be active throughout the application.

Client/Server Methods:
 - `DefaultSubscriptions.add(pubName, pubFunction = null)`:
   - (On the Server) if `pubFunction` is a function, uses that as a publication function and publishes it under the name `pubName`
   - (On the Client) a simple subscription to `pubName` is done

Client Methods:
 - `DefaultSubscriptions.isReady(pubName)`: checks if the subscription to `pubName` is ready
 - `DefaultSubscriptions.allReady()`: checks if **all** default subscriptions are ready
 - `DefaultSubscriptions.listSubscriptionNames()`: lists names of publications

Template Helpers:
 - `defaultSubscriptionIsReady(pubId)`: returns `DefaultSubscriptions.isReady(pubId)`
 - `defaultSubscriptionsAllReady`: returns `DefaultSubscriptions.allReady()`


### `_EnsureIndexes` (Server Only, Naturally)

`_EnsureIndexes` is a development tool for ensuring the existence of indexes/indices for Mongo collections. Here is some sample usage:
```javascript
_EnsureIndexes.addIndex(UserRecord.collection._name, [
    ['userId', 1],
]);

_EnsureIndexes.addIndex(SpecialRecord.collection._name, [
    ['localeId', 1],
    ['itemId', 1],
]);
```

To list the relevant commands, simply do:
```javascript
_EnsureIndexes.list();
```
... or, more specifically, something like:
```javascript
Meteor.startup(function() {
    if (Meteor.isServer) {
        console.log('=================================');
        console.log('=      Begin Index Listing      =');
        console.log('=================================');
        _EnsureIndexes.list();
        console.log('=================================');
        console.log('=       End Index Listing       =');
        console.log('=================================');
    }
});
```

To list extra indexes for collections:
```javascript
Meteor.startup(function() {
    if (Meteor.isServer) {
        console.log('=================================');
        console.log('=   Begin Extra Index Listing   =');
        console.log('=================================');
        _EnsureIndexes.listExtraIndexes();
        console.log('=================================');
        console.log('=    End Extra Index Listing    =');
        console.log('=================================');
    }
});
```

### Decorators (in JavaScript and Blaze)

Here is a simple way to execute some code once all subscriptions are ready:
```javascript
Template.MyTemplate.onCreated(
    TemplateLevelSubsCache.Decorators.whenAllSubsReady(
        function() {
            var instance = this;
            console.info('[' + instance.view.name + '] All Subs Ready.');
            /* code to run (once) after subs ready */
        },
        function() {/* (optional) code to run before each check */},
        function() {/* (optional) code to run after each check */}
    )
);
```

It is generally advisable that templates be wrapped with an additional "loading" block helper to display nothing prior to the arrival of all relevant data. The following block helper does exactly what one expects it to do:
```html
{{#IfAllSubsReady}}
  Content Here
{{else}}
  Loading...
{{/IfAllSubsReady}}
```

If one reuses the same "still loading" content everywhere, one might consider creating one's own block helper like that below:
```html
<template name="WhenAllSubsReady">
  {{#IfAllSubsReady}}
    {{> Template.contentBlock}}
  {{else}}
    Loading...
  {{/IfAllSubsReady}}
</template>
```
And use it as follows:
```html
{{#WhenAllSubsReady}}
  Content Here
{{/WhenAllSubsReady}}
```
Or better yet, ...
```html
<template name="WhenAllSubsReady">
  {{#if allSubsReady}}
    {{> Template.contentBlock}}
  {{else}}
    {{#if notReadyTemplate}}
      {{> Template.dynamic template=notReadyTemplate}}
    {{/if}}
  {{/if}}
</template>
```

## Notes

*If there is the need for functionality to remove a subscription from the cache immediately, please raise an issue. Presently, there seems to be no practical need for that functionality.*
