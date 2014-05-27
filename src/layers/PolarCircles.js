/**
 * PolarCircles is a map layer drawing the two polar circles (parallels at approximately 66 deg north and south)
 * @param {Object} style The graphical style to apply. 
 * @param {Object} scaleVisibility The visibility range.
 */
function PolarCircles(style, scaleVisibility) {"use strict";
	// FIXME ?
    AbstractLayer.call(this, style, scaleVisibility);
    PolarCircles.prototype = new AbstractLayer();
    this.LAT = (66 + 33 / 60 + 44 / 60 / 60) / 180 * Math.PI;
    
    this.render = function() {
        var ctx, bb, spacing, lineSegment;

        if (!this.isVisible()) {
            return;
        }

        ctx = this.canvas.getContext('2d');
        this.applyStyle(ctx);
        this.setupTransformation(ctx);
        bb = this.visibleGeographicBoundingBoxCenteredOnLon0;
        spacing = Graticule.getGraticuleSpacing(this.zoomFactor);
        lineSegment = spacing / Graticule.GRATICULE_DIV;
        ctx.beginPath();
        Graticule.addParallelPathToCanvas(this.projection, this.rotation, ctx, this.LAT, bb.west, bb.east, lineSegment);
        Graticule.addParallelPathToCanvas(this.projection, this.rotation, ctx, -this.LAT, bb.west, bb.east, lineSegment);
        ctx.stroke();
    };
}