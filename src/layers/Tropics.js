/**
 * Tropics is a map layer drawing the two tropics circles (parallels at 23.4378 deg north and south)
 * @param {Object} style The graphical style to apply. 
 * @param {Object} scaleVisibility The visibility range.
 */
function Tropics(style, scaleVisibility) {"use strict";
    PolarCircles.call(this, style, scaleVisibility);
    Tropics.prototype = new PolarCircles();
    this.LAT = 23.4378 / 180 * Math.PI;    
}