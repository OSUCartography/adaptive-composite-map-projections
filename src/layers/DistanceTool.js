// FIXME global variable for event handling
distanceTool = null; // replace by observer pattern

function DistanceTool(style) {"use strict";
    
    DistanceTool.prototype = new AbstractLayer();
    AbstractLayer.call(this, style, "distanceTool");
    
    var lon1 = 0, lat1 = 0, lon2 = 1, lat2 = 1;
    
    function getLine(layer) {
    	var xy = [], pts = [], nPts = 50;
    	
    	var lon0 = layer.mapCenter.lon0;   	
    	for (var i = 0; i <= nPts; i += 1) {
    		var f = i / nPts;
	    	PolylineLayer.intermediateGreatCirclePoint(lon1, lat1, lon2, lat2, f, xy);
    		layer.projection.forward(adjlon(xy[0] - lon0), xy[1], xy);
	    	pts[i * 2] = xy[0];
    		pts[i * 2 + 1] = xy[1];
    	}
    	return pts;
    }
    
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Vincenty Inverse Solution of Geodesics on the Ellipsoid (c) Chris Veness 2002-2012             */
/*                                                                                                */
/* from: Vincenty inverse formula - T Vincenty, "Direct and Inverse Solutions of Geodesics on the */
/*       Ellipsoid with application of nested equations", Survey Review, vol XXII no 176, 1975    */
/*       http://www.ngs.noaa.gov/PUBS_LIB/inverse.pdf                                             */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

/**
 * Calculates geodetic distance between two points specified by latitude/longitude using 
 * Vincenty inverse formula for ellipsoids
 *
 * @param   {Number} lat1, lon1: first point in decimal degrees
 * @param   {Number} lat2, lon2: second point in decimal degrees
 * @returns (Number} distance in metres between points
 */
function distVincenty(/*lat1, lon1, lat2, lon2*/) {
  var a = 6378137, b = 6356752.314245,  f = 1/298.257223563;  // WGS-84 ellipsoid params
  var L = lon2-lon1;
  var U1 = Math.atan((1-f) * Math.tan(lat1));
  var U2 = Math.atan((1-f) * Math.tan(lat2));
  var sinU1 = Math.sin(U1), cosU1 = Math.cos(U1);
  var sinU2 = Math.sin(U2), cosU2 = Math.cos(U2);
  
  var lambda = L, lambdaP, iterLimit = 100;
  do {
    var sinLambda = Math.sin(lambda), cosLambda = Math.cos(lambda);
    var sinSigma = Math.sqrt((cosU2*sinLambda) * (cosU2*sinLambda) + 
      (cosU1*sinU2-sinU1*cosU2*cosLambda) * (cosU1*sinU2-sinU1*cosU2*cosLambda));
    if (sinSigma==0) return 0;  // co-incident points
    var cosSigma = sinU1*sinU2 + cosU1*cosU2*cosLambda;
    var sigma = Math.atan2(sinSigma, cosSigma);
    var sinAlpha = cosU1 * cosU2 * sinLambda / sinSigma;
    var cosSqAlpha = 1 - sinAlpha*sinAlpha;
    var cos2SigmaM = cosSigma - 2*sinU1*sinU2/cosSqAlpha;
    if (isNaN(cos2SigmaM)) cos2SigmaM = 0;  // equatorial line: cosSqAlpha=0 (§6)
    var C = f/16*cosSqAlpha*(4+f*(4-3*cosSqAlpha));
    lambdaP = lambda;
    lambda = L + (1-C) * f * sinAlpha *
      (sigma + C*sinSigma*(cos2SigmaM+C*cosSigma*(-1+2*cos2SigmaM*cos2SigmaM)));
  } while (Math.abs(lambda-lambdaP) > 1e-12 && --iterLimit>0);

  if (iterLimit==0) return NaN  // formula failed to converge

  var uSq = cosSqAlpha * (a*a - b*b) / (b*b);
  var A = 1 + uSq/16384*(4096+uSq*(-768+uSq*(320-175*uSq)));
  var B = uSq/1024 * (256+uSq*(-128+uSq*(74-47*uSq)));
  var deltaSigma = B*sinSigma*(cos2SigmaM+B/4*(cosSigma*(-1+2*cos2SigmaM*cos2SigmaM)-
    B/6*cos2SigmaM*(-3+4*sinSigma*sinSigma)*(-3+4*cos2SigmaM*cos2SigmaM)));
  var s = b*A*(sigma-deltaSigma);
  
  s = s.toFixed(3); // round to 1mm precision
  return s;
  /*
  // note: to return initial/final bearings in addition to distance, use something like:
  var fwdAz = Math.atan2(cosU2*sinLambda,  cosU1*sinU2-sinU1*cosU2*cosLambda);
  var revAz = Math.atan2(cosU1*sinLambda, -sinU1*cosU2+cosU1*sinU2*cosLambda);
  return { distance: s, initialBearing: fwdAz.toDeg(), finalBearing: revAz.toDeg() };*/
}
    
    function renderDistance(layer, ctx) {
    	var xy = [];
    	PolylineLayer.intermediateGreatCirclePoint(lon1, lat1, lon2, lat2, 0.5, xy);
		layer.projection.forward(adjlon(xy[0] - layer.mapCenter.lon0), xy[1], xy);
		layer.drawCircle(ctx, xy, 6 / layer.mapScale);
		
		ctx.fillStyle = 'green';
		ctx.fill();
		ctx.stroke();
		
		//console.log(xy[0], xy[1]);
		
		var lon0 = layer.mapCenter.lon0;
        var dy = layer.getVerticalShift() * layer.mapScale;
        ctx.setTransform(1, 0, 0, 1, layer.canvas.width / 2, layer.canvas.height / 2 - dy);
        
		xy[0] *= layer.mapScale;
		xy[1] *= layer.mapScale;
		
		ctx.font = '40px Arial';
		var dist = (distVincenty() / 1000).toFixed(3);
		ctx.fillText(dist + " km", xy[0], -xy[1]);
		
    }
  	
    /**
     * Renders the layer.
     */
    this.render = function() {
        var x, y, ctx, pts, i, nPts, stroke, fill;
		fill = this.style.hasOwnProperty("fillStyle");
		stroke = this.style.hasOwnProperty("strokeStyle");
		
        ctx = this.canvas.getContext('2d');
        this.setupTransformation(ctx);
        this.applyStyle(ctx);

        pts = getLine(this);
		for ( i = 0, nPts = pts.length; i < nPts; i += 2) {
            this.drawCircle(ctx, [pts[i], pts[i + 1]], 3 / this.mapScale);
			if (fill) {
            	ctx.fill();
        	}
	        if (stroke) {
    	        ctx.stroke();
        	}
		}
        
        renderDistance(this, ctx);
        
    };
    
    this.setPoint1 = function(lon, lat) {
    	lon1 = lon;
    	lat1 = lat;
    };
    
    this.setPoint2 = function(lon, lat) {
    	lon2 = lon;
    	lat2 = lat;
    };
    
    // 0: no dragging; 1: point 1; 2: point 2
    var dragging = 0;
    
    this.onDragStart = function(lon, lat) {
    	var tol = 2 / 180 * Math.PI;
    	dragging = 0;
    	if (Math.abs(lon - lon1) < tol && Math.abs(lat - lat1) < tol) {
    		dragging = 1;
    	} else if (Math.abs(lon - lon2) < tol && Math.abs(lat - lat2) < tol) {
    		dragging = 2;
    	}
		console.log("drag start; ", lon / Math.PI * 180, lat / Math.PI * 180, "point id:", dragging);
		return dragging > 0;
	};
	
	this.onDrag = function(lon, lat) {
		if (dragging <= 0) {
			return false;
		}
		if (dragging === 1) {
			this.setPoint1(lon, lat);
		} else if (dragging === 2) {
			this.setPoint2(lon, lat);
		}
		
		console.log("drag; ", lon / Math.PI * 180, lat / Math.PI * 180, "point id:", dragging);
		return true;
	};
	
	this.onDragEnd = function() {
		if (dragging > 0) {
			dragging = 0;
			return true;
		} else {
			return false;
		}
	};
    
    // FIXME use global variable
    distanceTool = this;
}


