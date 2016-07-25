/*

Simple classes
==============

Inspired by John Resig's class implementation
http://ejohn.org/blog/simple-javascript-inheritance/

*/

function Class()
{}
module.exports = Class;

Class.subClass = function( newClass )
{
	newClass.prototype = Object.create( this.prototype );
	if ( newClass.init )
	{
		newClass.prototype.constructor = newClass.init;
	}
	newClass.subClass = this.subClass;
	newClass.super = this.prototype;
	return newClass;
};
