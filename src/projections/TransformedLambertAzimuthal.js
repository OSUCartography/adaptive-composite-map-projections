/*globals GraticuleOutline*/
function TransformedLambertAzimuthal(lonLimit, latLimit, ratio) {"use strict";
	var W_MAX = 0.999999, EPS10 = 1.e-10, w, m, n, CA, CB, projName, outline, cosLat0 = 1, lat0 = 0;

	this.isCylindrical = function() {
		return w === 1 && (lonLimit === 0 && latLimit === 0);
	};

	this.isHammer = function() {
		return w === 1 && (lonLimit === Math.PI / 2 && latLimit === Math.PI / 2 && ratio === 2);
	};

	this.isLambertAzimuthal = function() {
		if (w === 0 || (lonLimit === Math.PI && latLimit === Math.PI / 2 && ratio === Math.sqrt(2))) {
			console.log("is Lambert azimuthal");
		}
		return w === 0 || (lonLimit === Math.PI && latLimit === Math.PI / 2 && ratio === Math.sqrt(2));
	};

	this.isLambertCylindrical = function() {
		return w === 1 && (lonLimit === 0 && latLimit === 0 && ratio === Math.PI);
	};

	this.isPseudoCylindricalEqualArea = function() {
		return w === 1 && (lonLimit === 0 && latLimit === 61.9 / 180 * Math.PI && ratio === 2.03);
	};

	this.isQuarticAuthalic = function() {
		return w === 1 && (lonLimit === 0 && latLimit === Math.PI / 2 && Math.sqrt(2) * Math.PI / 2);
	};

	this.isWagner7 = function() {
		return w === 1 && (lonLimit === Math.PI / 3 && latLimit === 65 / 180 * Math.PI && ratio === 2);
	};

	this.toString = function() {
		return projName;
	};

	this.isEqualArea = function() {
		return true;
	};

	this.initialize = function(conf) {
		cosLat0 = Math.cos(conf.lat0);
		lat0 = conf.lat0;
	};

	function forwardTransformedLambertAzimuthal(lon, lat, xy) {
		var sinO, cosO, d;

		lon *= n;
		sinO = m * Math.sin(lat);
		cosO = Math.sqrt(1 - sinO * sinO);
		d = Math.sqrt(2 / (1 + cosO * Math.cos(lon)));
		xy[0] = CA * d * cosO * Math.sin(lon);
		xy[1] = CB * d * sinO;
	}

	function inverseTransformedLambertAzimuthal(x, y, lonlat) {
		var z, zz2_1, lon, lat;
		x /= CA;
		y /= CB;
		z = Math.sqrt(1 - 0.25 * (x * x + y * y));
		// if x * x + y * y equals 4, the point is on the bounding circle of the
		// Lambert azimuthal (the limiting case). This should never happen, as
		// inverseLambertAzimuthal() should be used in this case . If it does happen,
		// z is NaN and the following computations will return NaN coordinates.
		zz2_1 = 2 * z * z - 1;
		lon = Math.atan2(z * x, zz2_1) / n;
		lat = Math.asin(z * y / m);
		if (lon > Math.PI || lon < -Math.PI) {
			lonlat[0] = NaN;
			lonlat[1] = NaN;
		} else {
			lonlat[0] = lon;
			lonlat[1] = lat;
		}
	}

	// the quartic authalic is considerably simpler than the generic transformed Lambert azimuthal
	function forwardQuarticAuthalic(lon, lat, xy) {
		var lat_2, cos_lat2;
		lat_2 = lat / 2;
		cos_lat2 = Math.cos(lat_2);
		xy[0] = lon * (2 * cos_lat2 * cos_lat2 - 1) / cos_lat2;
		// this is a more efficient version of:
		//xy[0] = lon * Math.cos(lat) / Math.cos(lat_2);
		xy[1] = 2 * Math.sin(lat_2);
	}

	// the quartic authalic is considerably simpler than the generic transformed Lambert azimuthal
	function inverseQuarticAuthalic(x, y, lonlat) {
		// FIXME use MapMath.asin instead of Math.asin ?
		var c = Math.asin(y / 2), lat = c * 2, lon;
		lon = x / Math.cos(lat) * Math.cos(c);
		if (lon > Math.PI || lon < -Math.PI || lat > Math.PI / 2 || lat < -Math.PI / 2) {
			lonlat[0] = NaN;
			lonlat[1] = NaN;
		} else {
			lonlat[0] = lon;
			lonlat[1] = lat;
		}
	}

	// the cylindrical equal-area is considerably simpler than the generic transformed Lambert azimuthal
	function forwardCylindricalEqualArea(lon, lat, xy) {
		xy[0] = lon * cosLat0;
		xy[1] = Math.sin(lat) / cosLat0;
	}

	function inverseCylindricalEqualArea(x, y, lonlat) {
		var lon = x / cosLat0, lat = Math.asin((y) * cosLat0);
		if (lon > Math.PI || lon < -Math.PI || isNaN(lat)) {
			lonlat[0] = NaN;
			lonlat[1] = NaN;
		} else {
			lonlat[0] = lon;
			lonlat[1] = lat;
		}
	}

	function forwardLambertAzimuthal(lon, lat, xy) {
		var cosLat = Math.cos(lat), k = Math.sqrt(2 / (1 + cosLat * Math.cos(lon)));
		xy[0] = k * cosLat * Math.sin(lon);
		xy[1] = k * Math.sin(lat);
	}

	function inverseLambertAzimuthal(x, y, lonlat) {
		var dd, rh, phi, sinz, cosz;
		dd = x * x + y * y;
		if (dd > 4) {
			lonlat[0] = NaN;
			lonlat[1] = NaN;
			return;
		}
		rh = Math.sqrt(dd);
		phi = rh * 0.5;
		phi = 2 * Math.asin(phi);
		sinz = Math.sin(phi);
		cosz = Math.cos(phi);
		lonlat[1] = phi = (rh <= EPS10) ? 0 : Math.asin(y * sinz / rh);
		x *= sinz * cosLat0;
		y = cosz * rh;
		lonlat[0] = (y === 0) ? 0 : Math.atan2(x, y);
	}

    // equations are slightly simpler for pseudocylindrical projections than for the general 
    // transformed Lambert azimuthal
	function forwardPseudocylindrical(lon, lat, xy) {
		var sinO, cosO, d, CA = 0.8680136133199454, CB = 1.305997707108872, m = 0.8821268660176677;
        /*
        // CA, CB, m are different than the general case. They are computed for 
        // lat_limit = 61.9, and ratio = 2.03
        var m = Math.sin(61.9 / 180 * Math.PI);
        var k = Math.sqrt(2 * 2.03 * Math.sin(61.9 / 180 * Math.PI / 2.) / Math.PI);
        var k2 = Math.sqrt(m);
        var CA = k / k2;
        var CB = 1 / (k * k2);
        */    
		sinO = m * Math.sin(lat);
		cosO = Math.sqrt(1 - sinO * sinO);
		d = Math.sqrt(2 / (1 + cosO));
		xy[0] = CA * d * cosO * lon;
		xy[1] = CB * d * sinO;
	}

    // equations are slightly simpler for pseudocylindrical projections than for the general 
    // transformed Lambert azimuthal
    function inversePseudocylindrical(x, y, lonlat) {
		var sinO_2, cosO_2, CA = 0.8680136133199454, CB = 1.305997707108872, m = 0.8821268660176677;
		sinO_2 = y / (2 * CB);
		cosO_2 = Math.sqrt(1 - sinO_2 * sinO_2);
		lonlat[0] = (x / CA) * cosO_2 / (2 * cosO_2 * cosO_2 - 1);
		lonlat[1] = Math.asin(2 * sinO_2 * cosO_2 / m);
	}

	// setup this.forward and this.inverse
	// setup the projection name
	// setup the projection outline geometry
	function init(proj) {
		proj.forward = forwardTransformedLambertAzimuthal;
		proj.inverse = inverseTransformedLambertAzimuthal;

		// compute the outline after setting up the forward and inverse functions
		if (proj.isHammer()) {
			projName = "Hammer";
			outline = GraticuleOutline.pointedPoleOutline(proj);
		}
		// first test for cylindrical, then for Lambert cylindrical
		else if (proj.isLambertCylindrical()) {
			projName = "Lambert Cylindrial Equal Area";
			proj.forward = forwardCylindricalEqualArea;
			proj.inverse = inverseCylindricalEqualArea;
			outline = GraticuleOutline.rectangularOutline(proj, Math.PI / 2, -Math.PI, -Math.PI / 2, Math.PI);
		} else if (proj.isCylindrical()) {
			projName = "Cylindrical Equal Area";
			proj.forward = forwardCylindricalEqualArea;
			proj.inverse = inverseCylindricalEqualArea;
			outline = GraticuleOutline.rectangularOutline(proj, Math.PI / 2, -Math.PI, -Math.PI / 2, Math.PI);
		} else if (proj.isLambertAzimuthal()) {
			projName = "Lambert Azimuthal";
			proj.forward = forwardLambertAzimuthal;
			proj.inverse = inverseLambertAzimuthal;
			outline = GraticuleOutline.circularOutline(2);
		} else if (proj.isPseudoCylindricalEqualArea()) {
			projName = "Pseudocylindrical Equal Area";
			proj.forward = forwardPseudocylindrical;
			proj.inverse = inversePseudocylindrical;
            outline = GraticuleOutline.pseudoCylindricalOutline(proj);
		} else if (proj.isQuarticAuthalic()) {
			projName = "Quartic Authalic";
			proj.forward = forwardQuarticAuthalic;
			proj.inverse = inverseQuarticAuthalic;
			outline = GraticuleOutline.pointedPoleOutline(proj);
		} else if (proj.isWagner7()) {
			projName = "Wagner VII";
			outline = GraticuleOutline.genericOutline(proj);
		} else {
			projName = "Transformed Lambert Azimuthal";
			outline = GraticuleOutline.genericOutline(proj);
		}
	}

	function updateParameters() {
		var k, d, mixedLonLimit, mixedLatLimit, mixedRatio;

		// mix with values for Lambert azimuthal
		mixedLonLimit = lonLimit * w + (1 - w) * Math.PI;
		mixedLatLimit = latLimit * w + (1 - w) * Math.PI / 2;
		mixedRatio = ratio * w + (1 - w) * Math.sqrt(2);

		mixedLonLimit = Math.max(mixedLonLimit, 1e-4);
		mixedLatLimit = Math.max(mixedLatLimit, 1e-4);

		m = Math.sin(mixedLatLimit);
		n = mixedLonLimit / Math.PI;
		k = Math.sqrt(mixedRatio * Math.sin(mixedLatLimit / 2) / Math.sin(mixedLonLimit / 2));
		d = Math.sqrt(m * n);
		CA = k / d;
		CB = 1 / (k * d);
	}

	// Set how far this projection is from the Lambert azimuthal projection.
	// A weight parameter of 0 results in the Lambert azimuthal projection.
	// A weight parameter of 1 results in the a projection defined by the parameters
	// passed to the constructor of this object (e.e., Hammer, Wagner 7).
	this.transformToLambertAzimuthal = function(weight) {
		w = weight;
		if (w < 0) {
			w = 0;
		} else if (w > 1) {
			w = 1;
		}
		// first compute the projection parameters
		updateParameters();

		// then initialize the outlines (which will use the projection parameters)
		init(this);
	};
	this.transformToLambertAzimuthal(1);

	this.getOutline = function() {
		return outline;
	};

	this.getShaderUniforms = function() {
		var uniforms = [];

		// use Lambert azimuthal if needed
		uniforms.projectionID = w === 0 ? -2 : this.getID();
		if (w === 0) {
			uniforms.sinLatPole = Math.sin(Math.PI - lat0);
			uniforms.cosLatPole = Math.cos(Math.PI - lat0);
		}

		uniforms.wagnerM = m;
		uniforms.wagnerN = n;
		uniforms.wagnerCA = CA;
		uniforms.wagnerCB = CB;

		return uniforms;
	};

	this.getID = function() {
		return 654267985;
	};
}

TransformedLambertAzimuthal.Hammer = function() {"use strict";
	return new TransformedLambertAzimuthal(Math.PI / 2, Math.PI / 2, 2);
};

TransformedLambertAzimuthal.LambertCylindrical = function() {"use strict";
	return new TransformedLambertAzimuthal(0, 0, Math.PI);
};

TransformedLambertAzimuthal.PseudoCylindricalEqualArea = function() {"use strict";
	return new TransformedLambertAzimuthal(0, 61.9 / 180 * Math.PI, 2.03);
};

TransformedLambertAzimuthal.QuarticAuthalic = function() {"use strict";
	return new TransformedLambertAzimuthal(0, Math.PI / 2, Math.sqrt(2) * Math.PI / 2);
};

TransformedLambertAzimuthal.Wagner7 = function() {"use strict";
	return new TransformedLambertAzimuthal(Math.PI / 3, 65 / 180 * Math.PI, 2);
};
