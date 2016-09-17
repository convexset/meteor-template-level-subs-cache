import { Meteor } from 'meteor/meteor';
import { Fake } from 'meteor/anti:fake';
import { InformationBundler } from 'meteor/convexset:template-level-subs-cache';

var CustomerCollection = new Mongo.Collection("customers");
var PurchaseRecordCollection = new Mongo.Collection("purchases");
var THINGS = Array.prototype.map.call("ABCDEF", x => x);

InformationBundler.DEBUG_MODE = true;

if (Meteor.isServer) {
	Meteor.startup(function() {
		CustomerCollection.remove({});
		PurchaseRecordCollection.remove({});

		_.times(10, function() {
			var customerId = CustomerCollection.insert(Fake.user());
			_.times(Math.floor(5 * Math.random()), function() {
				var num = Math.floor(1 + 10 * Math.random());
				PurchaseRecordCollection.insert({
					customerId: customerId,
					item: Fake.fromArray(THINGS),
					count: num
				});
			});
		});
	});

	console.log("CustomerCollection sample:", CustomerCollection.findOne());
	console.log("PurchaseRecordCollection sample:", PurchaseRecordCollection.findOne());

	Meteor.publish("all-customers", () => CustomerCollection.find());
	Meteor.publish("all-purchases", () => PurchaseRecordCollection.find());
}

InformationBundler.addBasicInformationBundle({
	bundleName: "customers",
	helpers: {
		allCustomers: () => CustomerCollection.find(),
		getCustomerByIdx: (idx) => CustomerCollection.find().fetch()[idx]
	}
});

InformationBundler.addBasicInformationBundle({
	bundleName: "purchases",
	helpers: {
		allPurchases: () => PurchaseRecordCollection.find(),
	}
});

InformationBundler.addSupplementaryInformationBundle({
	bundleNames: ["customers", "purchases"],
	helpers: {
		customerPurchasesJoin: () => PurchaseRecordCollection.find().map(pr => _.extend({
			customer: CustomerCollection.findOne({
				_id: pr.customerId
			})
		}, pr))
	}
});

if (Meteor.isClient) {
	import { Template } from 'meteor/templating';

	InformationBundler.associateSubscription({
		bundleName: "customers",
		subName: "customers-sub",
		subscriptionArgs: ["all-customers"]
	});

	InformationBundler.associateSubscription({
		bundleName: "purchases",
		subName: "purchases-sub",
		subscriptionArgs: ["all-purchases"]
	});

	Template.InfoBundleTest.onCreated(function() {
		this.doTest = new ReactiveVar(false);
	});

	Template.InfoBundleTest.helpers({
		doTest: () => Template.instance().doTest.get()
	});

	Template.InfoBundleTest.events({
		"click button#start-test": function(event, template) {
			var doTest;
			Tracker.nonreactive(function() {
				doTest = template.doTest.get();
			});

			event.target.textContent = doTest ? "Start" : "Stop";
			template.doTest.set(!doTest);
		}
	});

	InformationBundler.prepareTemplates({
		templates: Template.InfoBundleTest_Customers,
		bundleNames: ["customers"]
	});

	InformationBundler.prepareTemplates({
		templates: Template.InfoBundleTest_Purchases,
		bundleNames: ["purchases"]
	});

	InformationBundler.prepareTemplates({
		templates: Template.InfoBundleTest_CustomersPurchases,
		bundleNames: ["customers", "purchases"]
	});

	Template.InfoBundleTest_Customers.onCreated(function() {
		console.info("[on-created] InfoBundleTest_Customers", this);
	});
	Template.InfoBundleTest_Purchases.onCreated(function() {
		console.info("[on-created] InfoBundleTest_Purchases", this);
	});
	Template.InfoBundleTest_CustomersPurchases.onCreated(function() {
		console.info("[on-created] InfoBundleTest_CustomersPurchases", this);
	});
	Template.__dynamic.onCreated(function() {
		console.info("[on-created] Template.dynamic", this);
	});
	Template.InfoBundleTest_CustomersPurchases_Child.onCreated(function() {
		console.info("[on-created] InfoBundleTest_CustomersPurchases_Child", this);
	});

	// InformationBundler.prepareTemplates({
	// 	templates: Template.InfoBundleTest_CustomersPurchases_Child,
	// 	bundleNames: []
	// });

	InformationBundler.touch([Template.__dynamic, Template.__dynamicWithDataContext]);
	InformationBundler.touch(Template.InfoBundleTest_CustomersPurchases_Child);
}
