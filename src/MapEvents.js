/*globals LambertCylindricalEqualArea, ProjectionFactory */
function MapEvents(map) {"use strict";

    // enlarge scale by this factor when the map is double tapped
    var TOUCH_DOUBLE_TAP_SCALE_FACTOR = 1.8,

    // relative change of scale for zooming with mouse scroll wheel
    WHEEL_ZOMM_STEP = 1.12,

    // If the central latitude is close to the equator, the central latitude snaps to the equator.
    // This angle is the tolerance for a relative vertical scale of 1. The angle is
    // linearly reduced for larger scales.
    SNAP_TOLERANCE_ANGLE = 3 / 180 * Math.PI;

    var prevDrag = [],

    // map scale when a pinch open or pinch close touch starts
    startTransformMapScale = null;

    addEvtListener(map.getParent(), 'mousewheel', function(e) {
        e = e || window.event;
        var node, delta, zoomStep, localX = e.clientX, localY = e.clientY;

        // correct for scrolled document
        localX += document.body.scrollLeft + document.documentElement.scrollLeft;
        localY += document.body.scrollTop + document.documentElement.scrollTop;

        // correct for nested offsets in DOM
        for ( node = parent; node; node = node.offsetParent) {
            localX -= node.offsetLeft;
            localY -= node.offsetTop;
        }

        // mouse wheel events differ depending on the platform
        delta = 0;
        if (e.wheelDelta) {
            delta = e.wheelDelta / 40 / 3;
        } else if (e.detail) {
            delta = -e.detail / 3;
        }

        zoomStep = Math.pow(WHEEL_ZOMM_STEP, Math.abs(delta));
        map.zoomBy(delta < 0 ? zoomStep : 1 / zoomStep, localX, localY);

        // prevent page scroll
        e.preventDefault();
    });

    // animated transition for double clicks and double taps
    // zoom and center of the map are changed
    function animateTransition(params) {
        var anim, startLon, startLat, startScale, startTime, endTime;

        startLon = map.getCentralLongitude();
        startLat = map.getCentralLatitude();
        startScale = map.getZoomFactor();
        startTime = new Date().getTime();
        endTime = startTime + params.duration;

        anim = setInterval(function() {
            var currTime, lon0, lat0, mapScale;
            currTime = new Date().getTime();
            if (currTime >= endTime) {
                clearInterval(anim);
                map.render();
            } else {
                lon0 = ((params.endLon - startLon) / (endTime - startTime)) * (currTime - startTime) + startLon;
                lat0 = ((params.endLat - startLat) / (endTime - startTime)) * (currTime - startTime) + startLat;
                map.setCenter(lon0, lat0);
                mapScale = ((params.endScale - startScale) / (endTime - startTime)) * (currTime - startTime) + startScale;
                map.setZoomFactor(mapScale); 
            }
        }, 1000 / params.fps);
    }


    Hammer(map.getParent()).on("doubletap", function(ev) {
        var xy, targetOffset, endLonLat, endScale;

        xy = ev.gesture.touches[0];
        targetOffset = $(xy.target).offset();
        endLonLat = map.canvasXY2LonLat(xy.pageX - targetOffset.left, xy.pageY - targetOffset.top);
        
        //if endLonLat are NaN use the current mapCenter for the Transition
        if(isNaN(endLonLat[0]) || isNaN(endLonLat[1])) {
            endLonLat[0] = map.getCentralLongitude();
            endLonLat[1] = map.getCentralLatitude();
        }

        endScale = map.getZoomFactor() * TOUCH_DOUBLE_TAP_SCALE_FACTOR;

        // FIXME
        if (endScale > MERCATOR_LIMIT_2) {
            endScale += 0.1;
        }

        animateTransition({
            duration : 500,
            fps : 30,
            endLon : endLonLat[0],
            endLat : endLonLat[1],
            endScale : endScale,
            onEnd : null,
            fastRender : true
        });
    });

    Hammer(map.getParent()).on("dragstart", function(ev) {
        var xy, projection, canvasXY;

        xy = ev.gesture.touches[0];
        
        prevDrag.x = xy.pageX;
        prevDrag.y = xy.pageY;

        projection = map.updateProjection();
        canvasXY = mouseToCanvasCoordinates({
            clientX : xy.x,
            clientY : xy.y
        }, parent);
    });

    /**
     * Adjust the central longitude and latitude. The geographic location under the point at startX/startY
     * should move to the point at endX/endY. The points are in "page" coordinates.
     */
    function moveMapCenter(startX, startY, endX, endY) {
        var projection, startLonLat, endLonLat, dLon, dLat, canSnapToEquator, lon0, lat0, mapHeight, maxLat0, mapCanvasOrigin;

        // convert from page coordinates to coordinates relative to the origin of the map DOM element.
        mapCanvasOrigin = $(map.getParent()).offset();
        startX -= mapCanvasOrigin.left;
        startY -= mapCanvasOrigin.top;
        endX -= mapCanvasOrigin.left;
        endY -= mapCanvasOrigin.top;
        
        projection = map.updateProjection();
        startLonLat = map.canvasXY2LonLat(startX, startY);
        endLonLat = map.canvasXY2LonLat(endX, endY);
        dLon = endLonLat[0] - startLonLat[0];
        dLat = endLonLat[1] - startLonLat[1];
        if (isNaN(dLon) || isNaN(dLat) || dLon === 0 || dLat === 0) {
            // pointer is outside the map graticule, or there is not change
            return;
        }

        // snap to equator
        canSnapToEquator = false;
        if (map.isEquatorSnapping()) {
            if (map.isUsingWorldMapProjection()) {
                // A world map projection is used. Only snap if the map can be rotated.
                canSnapToEquator = map.isRotateSmallScale();
            } else {
                // a projection for medium or large scales is used.
                // Don't snap when a cylindrical projection is used. A changed central latitude results in a
                // vertical shift for these projections.
                canSnapToEquator = !( projection instanceof LambertCylindricalEqualArea);
            }
            // snap tolerance is getting smaller with increasing map scale
            if (canSnapToEquator && Math.abs(map.getCentralLatitude() - dLat) < SNAP_TOLERANCE_ANGLE / Math.max(1, map.getZoomFactor())) {
                // this will result in lat0 equal to 0
                dLat = map.getCentralLatitude();
            }
        }

        lon0 = map.getCentralLongitude() - dLon;
        lat0 = map.getCentralLatitude() - dLat;

        // the rotation of central latitude has to be limited for world maps that cannot be rotated
        // when the user tries moving the globe vertically, the central latitude can take extreme values, but the graticule
        // moving vertically. When the user later zooms in, the extreme value of the central latitude will create
        // a confusing vertical rotation of the globe.
        if (map.isUsingWorldMapProjection() && !map.isRotateSmallScale()) {
            mapHeight = map.canvasXYToUnscaledXY(0, 0)[1];
            // create a new projection, as the inverse of the default projection converts the current lat0 to a vertical shift.
            // FIXME this does not work for most projections as toString is not a good method to identify projections.
            // use the projection ID instead
            projection = ProjectionFactory.getSmallScaleProjection(projection.toString());
            maxLat0 = ProjectionFactory.smallScaleMaxLat0(mapHeight, projection);
            if (lat0 > maxLat0) {
                lat0 = maxLat0;
            } else if (lat0 < -maxLat0) {
                lat0 = -maxLat0;
            }
        }

        map.setCenter(lon0, lat0);
    }


    Hammer(map.getParent()).on("drag", function(ev) {
        var xy, endLonLatBefore, endXYAfter, d, counter = 0;
        
        xy = ev.gesture.touches[0];
        
        
        // FIXME
        /*
        do {
            // geographic position of end position with old projection
            endLonLatBefore = map.canvasXY2LonLat(xy.pageX, xy.pageY);
            endXYAfter = map.lonLat2Canvas(endLonLatBefore[0], endLonLatBefore[1]);
            console.log("test", endLonLatBefore[0] / Math.PI * 180, endLonLatBefore[1] / Math.PI * 180);
            console.log(xy.pageX, xy.pageY, endXYAfter[0], endXYAfter[1]);
            
            // move center of map, which can change the projection itself
            moveMapCenter(prevDrag.x, prevDrag.y, xy.pageX, xy.pageY);
            map.updateProjection();
            // location of end position in new projection
            endXYAfter = map.lonLat2Canvas(endLonLatBefore[0], endLonLatBefore[1]);
            var dx = endXYAfter[0] - xy.pageX;
            var dy = endXYAfter[1] - xy.pageY;
            prevDrag.x = endXYAfter[0];
            prevDrag.y = endXYAfter[1];
            d = Math.sqrt(dx * dx + dy * dy);
            counter += 1;
            console.log(counter, "before", endLonLatBefore[0] / Math.PI * 180, endLonLatBefore[1] / Math.PI * 180, d);
            console.log(xy.pageX, xy.pageY, endXYAfter[0], endXYAfter[1]);
        }
        while (counter < 10 && d > 1)
        */
        //map.setCenter() in moveMapCenter renders the map
        moveMapCenter(prevDrag.x, prevDrag.y, xy.pageX, xy.pageY);

        prevDrag.x = xy.pageX;
        prevDrag.y = xy.pageY;
        
        map.getParent().style.cursor = 'move';
    });

    Hammer(map.getParent()).on("dragend", function(ev) {
        map.getParent().style.cursor = 'default';
        map.render(false);
    });

    // FIXME not tested
    Hammer(map.getParent()).on("transformstart", function(ev) {
        startTransformMapScale = map.getZoomFactor();
    });

    // FIXME not tested
    Hammer(map.getParent()).on("transform", function(ev) {
        if (startTransformMapScale === null) {
            return;
        }

        /*
         * ev.scale: The distance between two fingers since the start of an event as
         * a multiplier of the initial distance. The initial value is 1.0. If less
         * than 1.0 the gesture is pinch close to zoom out. If greater than 1.0 the
         * gesture is pinch open to zoom in.
         */

        map.setZoomFactor(ev.scale * startTransformMapScale);

        // transition to the mercator slippy map
        // FIXME ?
        if (map.getZoomFactor() > MERCATOR_LIMIT_2) {
            map.setZoomFactor(map.getZoomFactor() + 0.1);
            startTransformMapScale = null;
        }
        map.render(true);
    });

    // FIXME not tested
    Hammer(map.getParent()).on("transformend", function(ev) {
        startTransformMapScale = null;
    });
}