/**
 * A map layer for stroking or filling the outline of the graticule.
 * @param {Object} style The graphics style for stroking or filling.
 */
function GraticuleOutline(style) {"use strict";
    
    var HALF_PI = Math.PI / 2;
    
    AbstractLayer.call(this, style);

    /**
     * Returns whether a point in Cartesian coordinates is inside the graticule border.
     */
    this.isPointOnGraticule = function(x, y) {
        var pt = [], lon, lat;
        this.projection.inverse(x, y, pt);
        lon = pt[0];
        lat = pt[1];
        if (isNaN(lon) || isNaN(lat)) {
            return false;
        }
        if (lon >= -Math.PI && lon <= Math.PI && lat >= -HALF_PI && lat <= HALF_PI) {
            return true;
        }
        
        // FIXME this does not work with rotated spheres!
        
        return false;
    };

     /**
     * Returns whether the graticule border (the entire border or a piece) is visible on the map
     */
    this.isGraticuleBorderVisible = function() {
        // test whether all four corner points of the canvas are inside the graticule area
        var xy = this.map.canvasXYToUnscaledXY(0, 0);
        if (!this.isPointOnGraticule(xy[0], xy[1])) {
            return true;
        }
        xy = this.map.canvasXYToUnscaledXY(this.canvasWidth, 0);
        if (!this.isPointOnGraticule(xy[0], xy[1])) {
            return true;
        }
        xy = this.map.canvasXYToUnscaledXY(this.canvasWidth, this.canvasHeight);
        if (!this.isPointOnGraticule(xy[0], xy[1])) {
            return true;
        }
        xy = this.map.canvasXYToUnscaledXY(0, this.canvasHeight);
        if (!this.isPointOnGraticule(xy[0], xy[1])) {
            return true;
        }
        return false;
    };
    
    /**
     * Renders the layer.
     */
    this.render = function(fastRender, zoomToMap) {
        var x, y, ctx, pts, i, nPts;

        ctx = this.canvas.getContext('2d');
        this.applyStyle(ctx);

        // if the border of the graticule is not visible, only draw a filled rectangle covering the canvas
        if (zoomToMap && !this.isGraticuleBorderVisible()) {
            // the graticule border is not visible. Fill the visible area with the fill color, if one is defined.
            if (this.style.hasOwnProperty("fillStyle")) {
                ctx.setTransform(1, 0, 0, 1, 0, 0);
                // don't apply shadows, which would be innvisible and can be very slow to render
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 0;
                ctx.shadowBlur = 0;
                ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
                return;
            }
        }

        pts = this.projection.getOutline();
        if (!Array.isArray(pts)) {
            return;
        }

        this.setupTransformation(ctx, this.canvas.width, this.canvas.height);
        ctx.beginPath();
        ctx.moveTo(pts[0], pts[1]);
        for ( i = 2, nPts = pts.length; i < nPts; i += 2) {
            if (!isNaN( x = pts[i]) && !isNaN( y = pts[i + 1])) {
                ctx.lineTo(x, y);
            }
        }
        ctx.closePath();

        if (this.style.hasOwnProperty("fillStyle")) {
            ctx.fill();
        }

        if (this.style.hasOwnProperty("strokeStyle")) {
            ctx.stroke();
        }
    };
}

GraticuleOutline.prototype = new AbstractLayer();

// FIXME should vary with map scale
GraticuleOutline.N = 100;

/**
 * Returns a projected line along the east border of the graticule from north to south.
 * @param {Object} projection
 * @param {Object} pts
 * @param {Object} arrayOffset
 */
GraticuleOutline.eastBorder = function(projection, pts, arrayOffset) {"use strict";
    var nPts = GraticuleOutline.N, d = Math.PI / (nPts - 1), xy = [], lat, i;
    for ( i = 0; i < nPts; i += 1) {
        lat = Math.PI / 2 - i * d;
        projection.forward(Math.PI, lat, xy);
        pts[i * 2 + arrayOffset] = xy[0];
        pts[i * 2 + arrayOffset + 1] = xy[1];
    }
};

GraticuleOutline.westBorder = function(projection, pts, arrayOffset) {"use strict";
    // from south to north
    var nPts = GraticuleOutline.N, d = Math.PI / (nPts - 1), xy = [], lat, i;
    for ( i = 0; i < nPts; i += 1) {
        lat = -Math.PI / 2 + i * d;
        projection.forward(-Math.PI, lat, xy);
        pts[i * 2 + arrayOffset] = xy[0];
        pts[i * 2 + arrayOffset + 1] = xy[1];
    }
};

GraticuleOutline.northBorder = function(projection, pts, arrayOffset) {"use strict";
    // from west to east
    var nPts = GraticuleOutline.N * 2, d = 2 * Math.PI / (nPts - 1), xy = [], lon, i;
    for ( i = 0; i < nPts; i += 1) {
        lon = -Math.PI + i * d;
        projection.forward(lon, Math.PI / 2, xy);
        pts[i * 2 + arrayOffset] = xy[0];
        pts[i * 2 + arrayOffset + 1] = xy[1];
    }
};

GraticuleOutline.southBorder = function(projection, pts, arrayOffset) {"use strict";
    // from east to west
    var nPts = GraticuleOutline.N * 2, d = 2 * Math.PI / (nPts - 1), xy = [], lon, i;
    for ( i = 0; i < nPts; i += 1) {
        lon = Math.PI - i * d;
        projection.forward(lon, -Math.PI / 2, xy);
        pts[i * 2 + arrayOffset] = xy[0];
        pts[i * 2 + arrayOffset + 1] = xy[1];
    }
};

GraticuleOutline.pointedPoleOutline = function(projection) {"use strict";
    var pts = [];
    GraticuleOutline.eastBorder(projection, pts, 0);
    GraticuleOutline.westBorder(projection, pts, pts.length);
    return pts;
};

GraticuleOutline.circularOutline = function(R) {"use strict";
    var pts = [], nPts = GraticuleOutline.N * 4, da = Math.PI * 2 / nPts, i, a;
    for ( i = 0; i < nPts; i += 1) {
        a = da * i;
        pts[i * 2] = Math.cos(a) * R;
        pts[i * 2 + 1] = Math.sin(a) * R;
    }
    return pts;
};

GraticuleOutline.rectangularOutline = function(projection, top, left, bottom, right) {"use strict";
    var pts = [], xy = [];
    projection.forward(left, top, pts);
    pts[2] = -pts[0];
    pts[3] = pts[1];
    // don't mirror around equator, as a false northing might be applied
    projection.forward(right, bottom, xy);
    pts[4] = xy[0];
    pts[5] = xy[1];
    pts[6] = -xy[0];
    pts[7] = xy[1];
    return pts;
};

GraticuleOutline.pseudoCylindricalOutline = function(projection) {"use strict";
    var pts = [];
    GraticuleOutline.eastBorder(projection, pts, 0);
    GraticuleOutline.westBorder(projection, pts, pts.length);
    return pts;
};

GraticuleOutline.conicOutline = function(projection) {"use strict";
    var pts = [];
    GraticuleOutline.northBorder(projection, pts, 0);
    GraticuleOutline.southBorder(projection, pts, pts.length);
    return pts;
};

GraticuleOutline.genericOutline = function(projection) {"use strict";
    var pts = [];
    GraticuleOutline.northBorder(projection, pts, 0);
    GraticuleOutline.eastBorder(projection, pts, pts.length);
    GraticuleOutline.southBorder(projection, pts, pts.length);
    GraticuleOutline.westBorder(projection, pts, pts.length);
    return pts;
};
