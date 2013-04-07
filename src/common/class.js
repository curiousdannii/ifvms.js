/*

Simple JavaScript Inheritance
=============================

By John Resig
Released into the public domain?
http://ejohn.org/blog/simple-javascript-inheritance/

Changes from Dannii: support toString in IE8

*/

/*

TODO:
	Try copying properties
	Stop using _super
	
*/

var Class = (function(){

var initializing = 0;

// Determine if functions can be serialized
var fnTest = /\b_super\b/;

var Class = function(){};

// Check whether for in will iterate toString
var iterate_toString, name;
for ( name in { toString: 1 } ) { iterate_toString = 1; }

// Create a new Class that inherits from this class
Class.subClass = function( prop )
{
	var _super = this.prototype,
	proto,
	name,
	Klass;
	var prop_toString = !/native code/.test( '' + prop.toString ) && prop.toString;
	
	// Make the magical _super() function work
	var make_super = function( name, fn )
	{
		return function()
		{
			var tmp = this._super,
			ret;

			// Add a new ._super() method that is the same method
			// but on the super-class
			this._super = _super[name];

			// The method only need to be bound temporarily, so we
			// remove it when we're done executing
			ret = fn.apply( this, arguments );       
			this._super = tmp;

			return ret;
		};
	};
	
	// Instantiate a base class (but only create the instance,
	// don't run the init constructor)
	initializing = 1;
	/* jshint newcap:false */ // require classes to begin with a capital
	proto = new this();
	/* jshint newcap:true */
	initializing = 0;

	// Copy the properties over onto the new prototype
	for ( name in prop )
	{
		// Check if we're overwriting an existing function
		proto[name] = typeof prop[name] === "function" && typeof _super[name] === "function" && fnTest.test( prop[name] ) ?
			make_super( name, prop[name] ) :
			prop[name];
	}
	// Handle toString in IE8
	if ( !iterate_toString && prop_toString )
	{
		proto.toString = fnTest.test( prop_toString ) ? make_super( 'toString', prop_toString ) : prop_toString;
	}

	// The dummy class constructor
	Klass = proto.init ? function()
	{
		// All construction is actually done in the init method
		if ( !initializing )
		{
			this.init.apply( this, arguments );
		}
	} : function(){};

	// Populate our constructed prototype object
	Klass.prototype = proto;

	// Enforce the constructor to be what we expect
	Klass.constructor = Klass;

	// And make this class extendable
	Klass.subClass = Class.subClass;

	return Klass;
};

return Class;

})();