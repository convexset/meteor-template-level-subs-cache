import { Template } from 'meteor/templating';
import { Spacebars } from 'meteor/spacebars';
import { ReactiveDict } from 'meteor/reactive-dict';

import { prepareDefaultSubscriptions } from '../prepare-default-subscriptions.js';
const DefaultSubscriptions = prepareDefaultSubscriptions({Template, Spacebars, ReactiveDict});

export { DefaultSubscriptions };
