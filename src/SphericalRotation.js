function SphericalRotation(poleLat) {"use strict";
	var sinLatPole, cosLatPole;

	sinLatPole = Math.sin(poleLat);
	cosLatPole = Math.cos(poleLat);
	this.getPoleLat = function() {
		return poleLat;
	};
	this.transform = function(lon, lat, res) {
		var sinLon, cosLon, sinLat, cosLat, cosLat_x_cosLon;
		sinLon = Math.sin(lon);
		cosLon = Math.cos(lon);
		sinLat = Math.sin(lat);
		cosLat = Math.cos(lat);
		cosLat_x_cosLon = cosLat * cosLon;
		res[0] = aatan2(cosLat * sinLon, sinLatPole * cosLat_x_cosLon + cosLatPole * sinLat);
		sinLat = sinLatPole * sinLat - cosLatPole * cosLat_x_cosLon;
		res[1] = aasin(sinLat);
	};

	this.transformInv = function(lon, lat, res) {
		var sinLon = Math.sin(lon), cosLon = Math.cos(lon), sinLat = Math.sin(lat), cosLat = Math.cos(lat);
		var cosLat_x_cosLon = cosLat * cosLon;
		res[0] = aatan2(cosLat * sinLon, sinLatPole * cosLat_x_cosLon - cosLatPole * sinLat);
		res[1] = aasin(sinLatPole * sinLat + cosLatPole * cosLat_x_cosLon);
	};

}