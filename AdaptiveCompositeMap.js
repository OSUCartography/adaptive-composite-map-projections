/* Build Time: March 19, 2014 10:38:21 */
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
        startScale = map.getMapScale();
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
                map.setMapScale(mapScale);
                map.render(params.fastRender);
            }
        }, 1000 / params.fps);
    }


    Hammer(map.getParent()).on("doubletap", function(ev) {
        var xy, endLonLat, endScale;

        xy = ev.gesture.touches[0];
        endLonLat = map.canvasXY2LonLat(xy.pageX, xy.pageY);
        endScale = map.getMapScale() * TOUCH_DOUBLE_TAP_SCALE_FACTOR;

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
            if (canSnapToEquator && Math.abs(map.getCentralLatitude() - dLat) < SNAP_TOLERANCE_ANGLE / Math.max(1, map.getMapScale())) {
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
        moveMapCenter(prevDrag.x, prevDrag.y, xy.pageX, xy.pageY);

        prevDrag.x = xy.pageX;
        prevDrag.y = xy.pageY;
        map.render(true);
        map.getParent().style.cursor = 'move';
    });

    Hammer(map.getParent()).on("dragend", function(ev) {
        map.getParent().style.cursor = 'default';
        map.render(false);
    });

    // FIXME not tested
    Hammer(map.getParent()).on("transformstart", function(ev) {
        startTransformMapScale = map.getMapScale();
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

        map.setMapScale(ev.scale * startTransformMapScale);

        // transition to the mercator slippy map
        // FIXME ?
        if (map.getMapScale() > MERCATOR_LIMIT_2) {
            map.setMapScale(map.getMapScale() + 0.1);
            startTransformMapScale = null;
        }
        map.render(true);
    });

    // FIXME not tested
    Hammer(map.getParent()).on("transformend", function(ev) {
        startTransformMapScale = null;
    });
}
var CP = window.CanvasRenderingContext2D && CanvasRenderingContext2D.prototype;
if (CP.lineTo) {
    CP.dashedLine = function(x, y, x2, y2, da) {
        if (!da) {
            da = [8, 4];
        }
        this.save();
        var dx = (x2 - x), dy = (y2 - y);
        var len = Math.sqrt(dx * dx + dy * dy);
        var rot = Math.atan2(dy, dx);
        this.translate(x, y);
        this.moveTo(0, 0);
        this.rotate(rot);
        var dc = da.length;
        var di = 0, draw = true;
        x = 0;
        while (len > x) {
            x += da[di++ % dc];
            if (x > len) {
                x = len;
            }
            if (draw) {
                this.lineTo(x, 0);
            } else {
                this.moveTo(x, 0);
            }
            draw = !draw;
        }
        this.restore();
    };
}

function ProjectionDiagram(parent, diagramChangeListener) {"use strict";

    var DIAGRAM_WIDTH = 800, DIAGRAM_HEIGHT = 300,

    // maximum latitude for web mercator
    WEB_MERCATOR_MAX_LAT = 1.4844222297453322,

    // top and left margin for diagram lables
    XYMARGIN = 25,

    // maximum value on abscissa
    MAX_SCALE = Math.ceil(MERCATOR_LIMIT_2 + 1),

    // vertical distance between grid lines
    DEG_DIST = 15;

    // relative vertical position of projection names
    var NAME_V_POS_REL = 0.45;

    // font size and style
    var FONT_LARGE_H = 12;
    var FONT_MEDIUM_H = 12;
    var FONT_SMALL_H = 11;
    var FONT_LARGE = 'Bold ' + FONT_LARGE_H + 'px Sans-Serif';
    var FONT_MEDIUM = FONT_MEDIUM_H + 'px Sans-Serif';
    var FONT_SMALL = FONT_SMALL_H + 'px Sans-Serif';

    // height of text line
    var LINE_HEIGHT_LARGE = FONT_LARGE_H * 1.5;
    var LINE_HEIGHT_MEDIUM = FONT_MEDIUM_H * 1.5;

    // colors
    var BACKGROUND_COLOR = '#fff', TEXT_COLOR = '#000', TEXT_HALO_COLOR = '#fff', GRID_COLOR = '#eee';
    var TEXT_HALO_WIDTH = 8;

    // FIXME
    var diagram = this;

    var canvas = createCanvas('diagramCanvas', parent, DIAGRAM_WIDTH, DIAGRAM_HEIGHT);
    var buttonCanvas = createCanvas('diagramCanvasButton', parent, DIAGRAM_WIDTH, DIAGRAM_HEIGHT);

    // apply size to parent for proper layout
    parent.style.width = DIAGRAM_WIDTH;
    parent.style.height = DIAGRAM_HEIGHT;

    // FIXME: a duplicate from map.js
    // Compute scale factor such that the whole graticule fits onto the canvas.
    // This defines mapScale = 1
    function referenceScaleFactor() {
        //var h = ProjectionFactory.halfCentralMeridianLengthOfSmallScaleProjection(proj);
        var graticuleHeight = 2 * 1.5;
        //  FIXME ProjectionFactory.HALF_SMALL_SCALE_GRATICULE_HEIGHT;
        var vScale = canvas.height / graticuleHeight;
        return vScale;
    }

    // FIXME: a duplicate from map.js
    var canvasXY2UnscaledXY = function(x, y, mapScale) {
        var cx = canvas.width / 2;
        var cy = canvas.height / 2;
        x -= cx;
        y = cy - y;
        var scale = referenceScaleFactor() * mapScale;
        return [x / scale, y / scale];
    };

    function verticalLine(ctx, scale) {
        var hScale = (canvas.width - XYMARGIN) / MAX_SCALE;
        ctx.beginPath();
        ctx.moveTo((scale * hScale) + (XYMARGIN), XYMARGIN);
        ctx.lineTo((scale * hScale) + (XYMARGIN), canvas.height);
        ctx.stroke();
    }

    function solidLine(ctx, x1, y1, x2, y2, x3, y3) {
        var hScale = (canvas.width - XYMARGIN) / MAX_SCALE;
        var vScale = (canvas.height - XYMARGIN) / (Math.PI / 2);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        if (x3 && y3) {
            ctx.lineTo(x3, y3);
        }
        ctx.stroke();
    }

    function dashedLine(ctx, x0, y0, x1, y1) {
        ctx.beginPath();
        ctx.dashedLine(x0, y0, x1, y1);
        ctx.closePath();
        ctx.stroke();
    }

    function drawGrid(conf, ctx) {
        var i;
        var innerWidth = canvas.width - XYMARGIN;
        var innerHeight = canvas.height - XYMARGIN;

        // number of grid cells
        var hDivisions = Math.floor(MAX_SCALE);
        var vDivisions = 90 / DEG_DIST;

        // grid cell size
        var hgridSpace = innerWidth / hDivisions;
        var vgridSpace = innerHeight / vDivisions;

        //grid horizontal lines
        ctx.fillStyle = GRID_COLOR;
        for ( i = 1; i < vDivisions; i++) {
            ctx.beginPath();
            ctx.lineWidth = 0.25;
            ctx.moveTo(XYMARGIN, XYMARGIN + vgridSpace * i);
            ctx.lineTo(canvas.width, XYMARGIN + vgridSpace * i);
            ctx.stroke();
        }

        //grid vertical lines
        for ( i = 1; i < hDivisions; i++) {
            ctx.beginPath();
            ctx.lineWidth = 0.25;
            ctx.moveTo(XYMARGIN + hgridSpace * i, XYMARGIN);
            ctx.lineTo(XYMARGIN + hgridSpace * i, canvas.height);
            ctx.stroke();
        }

        // labels for horizontal lines
        ctx.textAlign = "right";
        ctx.fillStyle = TEXT_COLOR;
        ctx.font = FONT_MEDIUM;
        ctx.textBaseLine = 'middle';
        for ( i = 0; i <= vDivisions; i++) {
            ctx.fillText((vDivisions - i) * DEG_DIST + '\u00B0', XYMARGIN - 2, XYMARGIN + vgridSpace * i);
        }

        //labels for vertical lines
        ctx.textAlign = "center";
        ctx.font = FONT_MEDIUM;
        ctx.textBaseLine = 'top';
        for ( i = 1; i < hDivisions; i++) {
            ctx.fillText(i, XYMARGIN + i * hgridSpace, XYMARGIN - 3);
        }

        // label for last vertical line
        ctx.fillText(hDivisions, XYMARGIN + i * hgridSpace - 6, (XYMARGIN - 3));
    }

    function text(t, x, y, ctx) {
        ctx.strokeText(t, x, y);
        ctx.fillText(t, x, y);
    }

    function drawLimitsAndText(conf, ctx) {
        var i;

        var isLandscape = (conf.canvasHeight / conf.canvasWidth) < conf.formatRatioLimit;
        var isPortrait = (conf.canvasHeight / conf.canvasWidth) > 1 / conf.formatRatioLimit;
        var isSquare = !(isLandscape || isPortrait);

        var hScale = (canvas.width - XYMARGIN) / MAX_SCALE;
        var vScale = (canvas.height - XYMARGIN) / (Math.PI / 2);

        // diagram area
        var innerWidth = canvas.width - XYMARGIN;
        var innerHeight = canvas.height - XYMARGIN;

        // vertical position of projection names
        var tPos = innerHeight * NAME_V_POS_REL + XYMARGIN;

        // vertical canvas coordinates
        var yPolarUpperLat = XYMARGIN + innerHeight - conf.polarUpperLat * vScale;
        var yPolarUpperLatDefault = XYMARGIN + innerHeight - conf.polarUpperLatDefault * vScale;
        var yPolarLowerLat = XYMARGIN + innerHeight - conf.polarLowerLat * vScale;
        var yCylindricalLowerLat = XYMARGIN + innerHeight - conf.cylindricalLowerLat * vScale;
        var yCylindricalUpperLat = XYMARGIN + innerHeight - conf.cylindricalUpperLat * vScale;
        var yWebMercatorLat = XYMARGIN + innerHeight - WEB_MERCATOR_MAX_LAT * vScale;

        // horizontal canvas coordinates
        var xLimit1 = XYMARGIN + (conf.scaleLimit1 * hScale);
        var xLimit2 = XYMARGIN + (conf.scaleLimit2 * hScale);
        var xLimit3 = XYMARGIN + (conf.scaleLimit3 * hScale);
        var xLimit4 = XYMARGIN + (conf.scaleLimit4 * hScale);
        var xLimit5 = XYMARGIN + (conf.scaleLimit5 * hScale);
        var xMercator1 = XYMARGIN + (conf.mercatorLimit1 * hScale);
        var xMercator2 = XYMARGIN + (conf.mercatorLimit2 * hScale);

        drawGrid(conf, ctx);

        // vertical scale limits
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#000000';
        verticalLine(ctx, conf.scaleLimit1);
        verticalLine(ctx, conf.scaleLimit2);
        verticalLine(ctx, conf.mercatorLimit1);
        solidLine(ctx, xMercator2, canvas.height, xMercator2, yWebMercatorLat);

        // oblique Mercator limit at poles
        // FIXME
        solidLine(ctx, xMercator1 - 50, XYMARGIN, xMercator1, yWebMercatorLat, canvas.width, yWebMercatorLat);

        // for landscape format
        if (isLandscape) {
            // compute latitude on curve separating the azimuthal from the conic
            var y = canvasXY2UnscaledXY(canvas.width / 2, 0, conf.scaleLimit4)[1];
            var polarUpperLatAtXLimit4 = ProjectionFactory.polarLatitudeLimitForAlbersConic(y, conf.scaleLimit4);
            var yPolarUpperLatAtXLimit4 = XYMARGIN + innerHeight - polarUpperLatAtXLimit4 * vScale;

            // curved line separating the azimuthal from the conic
            ctx.beginPath();
            ctx.moveTo(xLimit4, yPolarUpperLatAtXLimit4);
            var lat, xPolarUpperLimitAtDefaultLat, s = conf.scaleLimit4;
            do {
                xPolarUpperLimitAtDefaultLat = s * hScale + XYMARGIN;
                y = canvasXY2UnscaledXY(canvas.width / 2, 0, s)[1];
                lat = ProjectionFactory.polarLatitudeLimitForAlbersConic(y, s);
                y = XYMARGIN + innerHeight - lat * vScale;
                ctx.lineTo(xPolarUpperLimitAtDefaultLat, y);
                s += 0.1;
            } while (lat < conf.polarUpperLatDefault);
            ctx.stroke();

            /*
            // FIXME hack: add transformation from azimuthal to cylindrical
            //scale limit 3
            dashedLine(ctx, xLimit2, XYMARGIN, xLimit4, yPolarUpperLatAtXLimit4);
            dashedLine(ctx, xLimit4, yPolarUpperLatAtXLimit4, xLimit3, yPolarLowerLat);
            dashedLine(ctx, xLimit3, yPolarLowerLat, xLimit3, yCylindricalUpperLat);
            dashedLine(ctx, xLimit3, yCylindricalUpperLat, xLimit4, yCylindricalLowerLat);

            // cylindrical upper latitude limit
            dashedLine(ctx, xLimit3, yCylindricalUpperLat, xMercator1, yCylindricalUpperLat);

            // cylindrical lower latitude limit
            solidLine(ctx, xLimit4, yCylindricalLowerLat, xLimit5, yCylindricalLowerLat, xMercator1, yCylindricalLowerLat);
            */

            //scale limit 3
            dashedLine(ctx, xLimit2, XYMARGIN, xLimit4, yPolarUpperLatAtXLimit4);
            dashedLine(ctx, xLimit4, yPolarUpperLatAtXLimit4, xLimit3, yPolarLowerLat);
            dashedLine(ctx, xLimit3, yPolarLowerLat, xLimit3, yCylindricalLowerLat);
            dashedLine(ctx, xLimit3, yCylindricalLowerLat, xLimit4, canvas.height);

            // cylindrical upper latitude limit
            dashedLine(ctx, xLimit3, yCylindricalUpperLat, xMercator1, yCylindricalUpperLat);

            // cylindrical lower latitude limit
            solidLine(ctx, xLimit4, canvas.height, xLimit5, yCylindricalLowerLat, xMercator1, yCylindricalLowerLat);

            //scale limit 4
            verticalLine(ctx, conf.scaleLimit4);

            //scale limit 5
            lat = ProjectionFactory.polarLatitudeLimitForAlbersConic(yPolarUpperLatDefault, conf.scaleLimit5);
            y = canvasXY2UnscaledXY(canvas.width / 2, 0, conf.scaleLimit5)[1];
            lat = ProjectionFactory.polarLatitudeLimitForAlbersConic(y, s);
            y = Math.max(XYMARGIN + innerHeight - lat * vScale, yPolarUpperLatDefault);
            dashedLine(ctx, xLimit5, y, xLimit5, yCylindricalLowerLat);

            //polar upper and lower latitude
            ctx.beginPath();
            ctx.moveTo(xPolarUpperLimitAtDefaultLat, yPolarUpperLatDefault);
            ctx.lineTo(xMercator1, yPolarUpperLatDefault);
            ctx.stroke();
            dashedLine(ctx, xLimit3, yPolarLowerLat, xMercator1, yPolarLowerLat);

        } else if (isPortrait) {
            verticalLine(ctx, conf.scaleLimit4);
            verticalLine(ctx, conf.scaleLimit5);
        }

        //Text
        ctx.fillStyle = TEXT_COLOR;
        ctx.strokeStyle = TEXT_HALO_COLOR;
        ctx.lineWidth = TEXT_HALO_WIDTH;
        ctx.lineJoin = "bevel";
        ctx.font = FONT_MEDIUM;
        ctx.textBaseLine = 'top';

        //Small-scale Projection Text
        ctx.textAlign = "center";
        ctx.font = FONT_LARGE;
        var cx = conf.scaleLimit1 / 2 * hScale + XYMARGIN;
        var cy = tPos - LINE_HEIGHT_LARGE;
        var smallScaleProj = ProjectionFactory.getSmallScaleProjection(conf.smallScaleProjectionName);
        if (smallScaleProj) {
            var str = smallScaleProj.toString();
            var strArray = str.split(' ');
            for ( i = 0; i < strArray.length; i++) {
                text(strArray[i], cx, cy += LINE_HEIGHT_LARGE, ctx);
            }
        }

        ctx.font = FONT_MEDIUM;
        cy += LINE_HEIGHT_MEDIUM;
        text('normal', cx, cy, ctx);
        cy += LINE_HEIGHT_MEDIUM;
        text('aspect', cx, cy, ctx);

        // Medium-scale projection text
        cx = (xLimit2 + ( isSquare ? xMercator1 : xLimit4)) / 2;
        cy = tPos;
        ctx.font = FONT_LARGE;
        text('Lambert', cx, cy, ctx);
        text('Azimuthal', cx, cy += LINE_HEIGHT_LARGE, ctx);
        ctx.font = FONT_MEDIUM;
        text('oblique', cx, cy += LINE_HEIGHT_MEDIUM, ctx);

        // Large-scale azimuthal
        if (isLandscape) {
            ctx.font = FONT_LARGE;
            cx = (xLimit4 + xMercator1) / 2;
            cy = XYMARGIN + 1.5 * FONT_LARGE_H;
            text('Lambert Azimuthal', cx, cy, ctx);
            ctx.font = FONT_MEDIUM;
            text('polar aspect', cx, cy += LINE_HEIGHT_MEDIUM, ctx);
            ctx.font = FONT_SMALL;
            ctx.textBaseLine = 'middle';
            cx = (xLimit5 + xMercator1) / 2;
            text('Adjusted standard parallels', cx, (yPolarUpperLatDefault + yPolarLowerLat) / 2, ctx);

            // large scale conic
            ctx.font = FONT_LARGE;
            cy = tPos;
            text('Albers Conic', cx, cy, ctx);
            ctx.font = FONT_MEDIUM;
            text('normal aspect', cx, cy += LINE_HEIGHT_LARGE, ctx);
            ctx.font = FONT_SMALL;
            text('Standard parallels at 1/6 and 5/6', cx, cy += LINE_HEIGHT_MEDIUM, ctx);

            // large scale cylindrical
            ctx.font = FONT_LARGE;
            ctx.textBaseLine = 'middle';
            text('Lambert Cylindrical', cx, (yCylindricalLowerLat + canvas.height) / 2, ctx);
            ctx.font = FONT_SMALL;
            text('Adjusted standard parallels', cx, (yCylindricalLowerLat + yCylindricalUpperLat) / 2, ctx);
        } else if (isPortrait) {
            // large scale azimmuthal
            ctx.font = FONT_LARGE;
            cx = (xLimit4 + xMercator1) / 2;
            cy = tPos;
            text('Lambert Cylindrical', cx, cy, ctx);
            ctx.font = FONT_MEDIUM;
            text('transverse', cx, cy += LINE_HEIGHT_LARGE, ctx);
        }

        // Mercator text for largest scales
        ctx.font = FONT_LARGE;
        cx = (conf.mercatorLimit2 + MAX_SCALE) / 2 * hScale + XYMARGIN;
        text('Mercator', cx, tPos, ctx);
    }


    this.renderButton = function(mapScale, lat0) {
        buttonCanvas.width = DIAGRAM_WIDTH;
        buttonCanvas.height = DIAGRAM_HEIGHT;

        var ctx = buttonCanvas.getContext('2d');
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, buttonCanvas.width, buttonCanvas.height);

        var r = 6;
        var rCenter = 1;
        var hScale = (buttonCanvas.width - XYMARGIN) / MAX_SCALE;
        var vScale = (buttonCanvas.height - XYMARGIN) / (Math.PI / 2);
        var x = (Math.min(MAX_SCALE, mapScale) * hScale) + XYMARGIN;
        var y = buttonCanvas.height - Math.abs(lat0) * vScale;
        ctx.save();
        ctx.beginPath();
        ctx.shadowColor = "gray";
        ctx.shadowOffsetX = 1.5;
        ctx.shadowOffsetY = 1.5;
        ctx.shadowBlur = 3;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, 2 * Math.PI, false);
        ctx.fillStyle = "#8ED6FF";
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = '#000000';
        ctx.stroke();
        ctx.fillStyle = "black";
        ctx.fillRect(x - rCenter, y - rCenter, rCenter * 2, rCenter * 2);
        ctx.restore();
    };

    function drawUpperLatitude(conf, ctx, hScale, vScale) {
        var i, n, lineTo = function(ctx, x, y) {
            ctx.moveTo(x, y);
            lineTo = function(ctx, x, y) {
                ctx.lineTo(x, y);
            };
        };

        ctx.save();
        ctx.beginPath();
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'gray';

        for ( i = 0, n = upperLatitudeLimit.length; i < n; i += 1) {
            var scale = MAX_SCALE / N_upperLatitudeLimit * i;
            var lat = upperLatitudeLimit[i];
            lineTo(ctx, XYMARGIN + hScale * scale, canvas.height - vScale * lat);
        }
        ctx.stroke();
        ctx.restore();
    }


    this.render = function(conf) {
        canvas.width = DIAGRAM_WIDTH;
        canvas.height = DIAGRAM_HEIGHT;

        var ctx = canvas.getContext('2d');
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (!conf) {
            return;
        }
        var hScale = (canvas.width - XYMARGIN) / MAX_SCALE;
        var vScale = (canvas.height - XYMARGIN) / (Math.PI / 2);

        ctx.fillStyle = BACKGROUND_COLOR;
        ctx.fillRect(XYMARGIN, XYMARGIN, canvas.width - XYMARGIN, canvas.height - XYMARGIN);
        drawUpperLatitude(conf, ctx, hScale, vScale);
        drawLimitsAndText(conf, ctx);

        // frame
        ctx.beginPath();
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        var w = canvas.width - XYMARGIN - ctx.lineWidth / 2;
        var h = canvas.height - XYMARGIN - ctx.lineWidth / 2;
        ctx.strokeRect(XYMARGIN, XYMARGIN, w, h);

        this.renderButton(conf.mapScale, conf.lat0);
    };

    function diagramMouseDown(e) {

        function readDiagram(e) {
            var hScale = (canvas.width - XYMARGIN) / MAX_SCALE;
            var vScale = (canvas.height - XYMARGIN) / (Math.PI / 2);
            var canvasXY = mouseToCanvasCoordinates(e, parent);
            var mapScale = (canvasXY.x - XYMARGIN) / hScale;
            var lat0 = (canvas.height - canvasXY.y) / vScale;
            lat0 = Math.max(0, lat0);

            diagram.renderButton(mapScale, lat0);

            if (diagramChangeListener) {
                diagramChangeListener(lat0, mapScale);
            }
        }

        function diagramMouseMove(e) {
            readDiagram(e);
            canvas.style.cursor = 'move';
        }

        function diagramMouseUp(e) {
            readDiagram(e);
            stopDrag();
        }

        function stopDrag() {
            document.body.style.cursor = null;
            document.removeEventListener('mousemove', diagramMouseMove, false);
            document.removeEventListener('mouseup', diagramMouseUp, false);
            canvas.style.cursor = 'default';
        }


        document.addEventListener('mousemove', diagramMouseMove, false);
        document.addEventListener('mouseup', diagramMouseUp, false);
    }

    // FIXME
    var N_upperLatitudeLimit = 100;
    var i;
    var upperLatitudeLimit = [N_upperLatitudeLimit];
    for ( i = 0; i <= N_upperLatitudeLimit; i += 1) {
        var scale = MAX_SCALE / N_upperLatitudeLimit * i;
        var y = canvasXY2UnscaledXY(canvas.width / 2, 0, scale)[1];
        var lat = ProjectionFactory.polarLatitudeLimitForAlbersConic(y, scale);
        upperLatitudeLimit[i] = lat;
    }

    canvas.parentNode.addEventListener('mousedown', diagramMouseDown, false);
    // canvas is not selectable. Without this, the mouse changes to a text
    // selection cursor while dragging on Safari.
    canvas.onselectstart = function() {
        return false;
    };
}
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
// cross-browser requestAnimationFrame and cancelAnimationFrame
// http://www.paulirish.com/2011/requestanimationframe-for-smart-animating/
( function() {
        var x, lastTime = 0;
        var vendors = ['webkit', 'moz'];
        for ( x = 0; x < vendors.length && !window.requestAnimationFrame; ++x) {
            window.requestAnimationFrame = window[vendors[x] + 'RequestAnimationFrame'];
            window.cancelAnimationFrame = window[vendors[x] + 'CancelAnimationFrame'] || window[vendors[x] + 'CancelRequestAnimationFrame'];
        }

        if (!window.requestAnimationFrame)
            window.requestAnimationFrame = function(callback, element) {
                var currTime = new Date().getTime();
                var timeToCall = Math.max(0, 16 - (currTime - lastTime));
                var id = window.setTimeout(function() {
                    callback(currTime + timeToCall);
                }, timeToCall);
                lastTime = currTime + timeToCall;
                return id;
            };

        if (!window.cancelAnimationFrame)
            window.cancelAnimationFrame = function(id) {
                clearTimeout(id);
            };
    }());

function isPowerOfTwo(x) {"use strict";
    /*jslint bitwise:true */
    return (x & (x - 1)) === 0;
}

function nextHighestPowerOfTwo(x) {"use strict";
    var i;
    x -= 1;
    /*jslint bitwise:true */
    for ( i = 1; i < 32; i <<= 1) {
        x = x | x >> i;
    }
    /*jslint bitwise:false */
    return x + 1;
}

function createCanvas(id, parent, desiredWidthInCSSPixels, desiredHeightInCSSPixels) {"use strict";
    var devicePixelRatio, canvas;

    canvas = document.createElement('canvas');
    canvas.setAttribute("id", id);

    // FIXME remove absolute positioning
    canvas.style.position = 'absolute';
    canvas.style.left = '0px';
    canvas.style.top = '0px';

    resizeCanvasElement(canvas, desiredWidthInCSSPixels, desiredHeightInCSSPixels);

    // canvas is not selectable. Without this, the mouse changes to a text
    // selection cursor while dragging on Safari.
    canvas.onselectstart = function() {
        return false;
    };

    parent.appendChild(canvas);
    return canvas;
}

function resizeCanvasElement(canvas, desiredWidthInCSSPixels, desiredHeightInCSSPixels) {"use strict";
    // http://www.khronos.org/webgl/wiki/HandlingHighDPI

    // set the display size of the canvas.
    canvas.style.width = desiredWidthInCSSPixels + "px";
    canvas.style.height = desiredHeightInCSSPixels + "px";

    // set the size of the drawingBuffer
    var devicePixelRatio = window.devicePixelRatio || 1;

    // FIXME disable for now, layers need to be updated first
    devicePixelRatio = 1;

    canvas.width = desiredWidthInCSSPixels * devicePixelRatio;
    canvas.height = desiredHeightInCSSPixels * devicePixelRatio;
}

// http://stackoverflow.com/questions/646628/javascript-startswith
if ( typeof String.prototype.startsWith !== 'function') {
    String.prototype.startsWith = function(str) {
        return this.slice(0, str.length) == str;
    };
}

if ( typeof String.prototype.endsWith !== 'function') {
    String.prototype.endsWith = function(suffix) {"use strict";
        return this.indexOf(suffix, this.length - suffix.length) !== -1;
    };
}

// from High Performance JavaScript
if (!String.prototype.trim) {
    String.prototype.trim = function() {
        var str = this.replace(/^\s+/, ""), end = str.length - 1, ws = /\s/;
        while (ws.test(str.charAt(end))) {
            end -= 1;
        }
        return str.slice(0, end + 1);
    };
}

// O'Reilly JavaScript Patterns
if ( typeof Array.isArray === "undefined") {
    Array.isArray = function(arg) {
        return Object.prototype.toString.call(arg) === "[object Array]";
    };
}

if (!Array.prototype.indexOf) {
    Array.prototype.indexOf = function(needle) {
        var i;
        for ( i = 0, n = this.length; i < n; i++) {
            if (this[i] === needle) {
                return i;
            }
        }
        return -1;
    };
}

function addEvtListener(element, eventName, callback) {"use strict";
    if ( typeof (element) === "string") {
        element = document.getElementById(element);
    }
    if (element === null) {
        return;
    }

    if (element.addEventListener) {
        if (eventName === 'mousewheel') {
            element.addEventListener('DOMMouseScroll', callback, false);
        }
        element.addEventListener(eventName, callback, false);
    } else if (element.attachEvent) {
        element.attachEvent("on" + eventName, callback);
    }
}

function removeEvtListener(element, eventName, callback) {
    if ( typeof (element) == "string")
        element = document.getElementById(element);
    if (element == null)
        return;
    if (element.removeEventListener) {
        if (eventName == 'mousewheel')
            element.removeEventListener('DOMMouseScroll', callback, false);
        element.removeEventListener(eventName, callback, false);
    } else if (element.detachEvent)
        element.detachEvent("on" + eventName, callback);
}

function cancelEvent(e) {
    e = e ? e : window.event;
    if (e.stopPropagation)
        e.stopPropagation();
    if (e.preventDefault)
        e.preventDefault();
    e.cancelBubble = true;
    e.cancel = true;
    e.returnValue = false;
    return false;
}

function loadData(url, callback) {

    var i, xhr, activeXids = ['MSXML2.XMLHTTP.3.0', 'MSXML2.XMLHTTP', 'Microsoft.XMLHTTP'];

    xhr.onreadystatechange = function() {
        if (xhr.readyState != 4) {
            return false;
        }
        if (xhr.status !== 200) {
            console.error("XMLHttpRequest error, status code: " + xhr.status, xhr.statusText);
            return false;
        }
        callback(xhr.responseText);
    };

    if ( typeof XMLHttpRequest != undefined) {
        xhr = new XMLHttpRequest();
    } else {// IE before 7
        for ( i = 0; i < activeXids.length; i += 1) {
            try {
                xhr = new ActiveXObject(activeXids[i]);
                break;
            } catch (e) {
            }
        }
    }

    xhr.open("GET", url, true);
    xhr.send();
}

function formatLatitude(lat) {
    if (isNaN(lat)) {
        return "&ndash;";
    }
    return Math.abs(lat / Math.PI * 180).toFixed(1) + "\u00B0" + (lat < 0 ? "S" : "N");
}

function formatLongitude(lon) {
    if (isNaN(lon)) {
        return "&ndash;";
    }
    return Math.abs(lon / Math.PI * 180).toFixed(1) + "\u00B0" + (lon < 0 ? "W" : "E");
}
/*globals WebGLDebugUtils, J3DIMatrix4, Float32Array, isPowerOfTwo, nextHighestPowerOfTwo */

function WebGL() {"use strict";
}

/**
 * Creates a webgl context. From webgl-utils.js
 * @param {!Canvas} canvas The canvas tag to get context
 *     from.
 * @return {!WebGLContext} The created context.
 */
WebGL.create3DContext = function(canvas, opt_attribs) {"use strict";
    var context, i, names = ["webgl", "experimental-webgl", "webkit-3d", "moz-webgl"];
    context = null;
    for ( i = 0; i < names.length; i += 1) {
        try {
            context = canvas.getContext(names[i], opt_attribs);
        } catch(ignore) {
        }
        if (context) {
            break;
        }
    }
    return context;
};

WebGL.loadShader = function(gl, url) {"use strict";

    // http://www.khronos.org/message_boards/showthread.php/7170-How-to-include-shaders
    var shader, req = new XMLHttpRequest();
    req.open("GET", url, false);
    req.send(null);
    if (req.status !== 200/* http */ && req.status !== 0 /* local file*/) {
        throw new Error("Could not load shader at " + url);

    }

    shader = gl.createShader(url.endsWith("frag") ? gl.FRAGMENT_SHADER : gl.VERTEX_SHADER);
    gl.shaderSource(shader, req.responseText);

    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        throw gl.getShaderInfoLog(shader);
    }
    return shader;
};

/**
 * Enables anisotropic filtering extension if available.
 * Only makes sense for mip maps, which are only available for power-of-two textures
 */
WebGL.enableAnisotropicFiltering = function(gl, texture) {"use strict";
    var max, ext;
    ext = (gl.getExtension('EXT_texture_filter_anisotropic') || gl.getExtension('MOZ_EXT_texture_filter_anisotropic') || gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic'));
    if (ext !== null) {
        max = gl.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameterf(gl.TEXTURE_2D, ext.TEXTURE_MAX_ANISOTROPY_EXT, max);
    }
};

WebGL.init = function(canvas) {"use strict";

    // simulate lost context
    if ( typeof WebGLDebugUtils !== 'undefined') {
        // http://www.khronos.org/webgl/wiki/HandlingContextLost#Use_the_context_lost_simulator_to_help_find_issues
        canvas = WebGLDebugUtils.makeLostContextSimulatingCanvas(canvas);
        //canvas.loseContextInNCalls(50);
    }

    // parameters: http://www.khronos.org/registry/webgl/specs/latest/1.0/#5.2.1
    var gl = WebGL.create3DContext(canvas, {
        alpha : true,
        depth : false,
        stencil : false,
        // antialiasing is not available everywhere. For example, currently not with Firefox and Chrome on Mac.
        antialias : true,
        premultipliedAlpha : false,
        preserveDrawingBuffer : false
    });
    if (gl === null) {
        return null;
    }

    // test for texture mapping support
    // https://developer.mozilla.org/en-US/docs/Web/WebGL/WebGL_best_practices
    if (gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS) <= 0) {
        return null;
    }

    if ( typeof WebGLDebugUtils !== 'undefined') {
        console.log("Creating WebGL debug context");
        // http://www.khronos.org/webgl/wiki/Debugging
        gl = WebGLDebugUtils.makeDebugContext(gl, function(err, funcName, args) {
            throw WebGLDebugUtils.glEnumToString(err) + " was caused by call to: " + funcName;
        }/*, function(functionName, args) {
         console.log("gl." + functionName + "(" + WebGLDebugUtils.glFunctionArgsToString(functionName, args) + ")");
         for (var ii = 0; ii < args.length; ++ii) {
         if (args[ii] === undefined) {
         console.error("undefined passed to gl." + functionName + "(" + WebGLDebugUtils.glFunctionArgsToString(functionName, args) + ")");
         }
         }
         }*/);
    }

    return gl;
};

/**
 * Add webglcontextlost and webglcontextrestored event handlers.
 * When the context is lost, animation loops should be cancelled, and resources, such as texture images
 * may or may not have been loaded.
 * @param {Object} canvas
 * @param {Object} contextRestoredHandler Will receive a WebGLContext as a parameter
 */
WebGL.addContextLostAndRestoredHandler = function(canvas, contextRestoredHandler) {"use strict";
    // only add handlers once
    // TODO make sure handlers have not already been added

    // http://www.khronos.org/webgl/wiki/HandlingContextLost
    // add a context lost handler
    canvas.addEventListener("webglcontextlost", function(event) {
        // by default the browser does not generate the context restore event.
        // prevent the default behavior, to receive the context restore event
        event.preventDefault();
    }, false);

    // re-setup all WebGL state and re-create all WebGL resources when the context is restored.
    canvas.addEventListener("webglcontextrestored", function(event) {
        console.log("restoring context");
        contextRestoredHandler(WebGL.init(canvas));
        console.log("context restored");
    }, false);
};

WebGL.loadShaderProgram = function(gl, vertexShaderURL, fragmentShaderURL) {"use strict";
    // FIXME should be asynchronous
    var vertexShader, fragmentShader, shaderProgram;

    vertexShader = WebGL.loadShader(gl, vertexShaderURL);
    fragmentShader = WebGL.loadShader(gl, fragmentShaderURL);
    shaderProgram = gl.createProgram();
    gl.attachShader(shaderProgram, vertexShader);
    gl.attachShader(shaderProgram, fragmentShader);
    gl.linkProgram(shaderProgram);
    gl.useProgram(shaderProgram);

    WebGL.setDefaultUniforms(gl, shaderProgram);

    return shaderProgram;
};

WebGL.setDefaultUniforms = function(gl, program) {"use strict";
    gl.uniform1f(gl.getUniformLocation(program, 'projectionID'), 0);
    gl.uniform1f(gl.getUniformLocation(program, 'mix1ProjectionID'), 0);
    gl.uniform1f(gl.getUniformLocation(program, 'mix2ProjectionID'), 0);
    gl.uniform1f(gl.getUniformLocation(program, 'mixWeight'), 0);

    gl.uniform1f(gl.getUniformLocation(program, 'sinLatPole'), 1);
    gl.uniform1f(gl.getUniformLocation(program, 'cosLatPole'), 0);

    gl.uniform1f(gl.getUniformLocation(program, 'meridian'), 0);

    gl.uniform1f(gl.getUniformLocation(program, 'falseNorthing'), 0);
    gl.uniform1f(gl.getUniformLocation(program, 'falseNorthing2'), 0);

    gl.uniform1f(gl.getUniformLocation(program, 'wagnerM'), 0);
    gl.uniform1f(gl.getUniformLocation(program, 'wagnerN'), 0);
    gl.uniform1f(gl.getUniformLocation(program, 'wagnerCA'), 0);
    gl.uniform1f(gl.getUniformLocation(program, 'wagnerCB'), 0);

    gl.uniform1f(gl.getUniformLocation(program, 'n'), 0);
    gl.uniform1f(gl.getUniformLocation(program, 'c'), 0);
    gl.uniform1f(gl.getUniformLocation(program, 'rho0'), 0);
    
    gl.uniform1i(gl.getUniformLocation(program, 'flagStrips'), 0); 
    
    
};

WebGL.setUniforms = function(gl, program, scale, lon0, uniforms, canvas) {"use strict";

    var viewTransform, i;
    // set default uniform values that are needed, e.g. rotation on sphere
    WebGL.setDefaultUniforms(gl, program);
    gl.enableVertexAttribArray(gl.getAttribLocation(program, 'vPosition'));

    gl.uniform1f(gl.getUniformLocation(program, 'meridian'), lon0);

    // modelViewProjMatrix
    viewTransform = new J3DIMatrix4();
    viewTransform.scale(canvas.height / canvas.width * scale, scale, 1, 1);
    gl.uniformMatrix4fv(gl.getUniformLocation(program, 'modelViewProjMatrix'), false, viewTransform.getAsFloat32Array());

    // uniforms for projection
    for (i in uniforms) {
        if (uniforms.hasOwnProperty(i)) {
            if (Array.isArray(uniforms[i])) {
                gl.uniform3f(gl.getUniformLocation(program, i), uniforms[i][0], uniforms[i][1], uniforms[i][2]);
            } else {
                gl.uniform1f(gl.getUniformLocation(program, i), uniforms[i]);
            }
        }
    }
    
    gl.uniform2f(gl.getUniformLocation(program, 'scaleXY'), canvas.height * scale, canvas.height * scale);
    gl.uniform2f(gl.getUniformLocation(program, 'dXY'), canvas.width / 2, canvas.height / 2);
};

WebGL.loadGeometry = function(gl) {"use strict";
    var vertices, b, x, xIdx, y, yIdx, vbo, nStrips, stripWidth, geometryStrips = [];

	stripWidth = 1;
    nStrips = 360 / stripWidth;
    b = {
        startX : -180,
        startY : -90,
        stepY : stripWidth,
        countY : 180 / stripWidth + 1
    };

    // create a series of vertical triangle strips.
    // FIXME create degenerate triangles for larger triangle strips or
    // use index buffer instead of triangle strips
    for ( xIdx = 0; xIdx < nStrips; xIdx += 1) {
        x = xIdx * stripWidth + b.startX;
        vertices = new Float32Array(4 * b.countY);

        // create a vertical triangle strip, triangles in clockwise orientation
        for ( y = b.startY, yIdx = 0; yIdx < b.countY; yIdx += 1, y += b.stepY) {
            vertices.set([x + stripWidth, y, x, y], 4 * yIdx);
        }
        vbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
        geometryStrips.push({
            buffer : vbo,
            vertexCount : vertices.length / 2
        });
    }
    return geometryStrips;
};

WebGL.deleteGeometry = function(gl, geometryStrips) {"use strict";
    var i, nStrips = geometryStrips.length;
    for ( i = 0; i < nStrips; i += 1) {
        gl.deleteBuffer(geometryStrips[i].buffer);
    }
};

// Scale up a texture image to the next higher power of two dimension.
// Or scale down if the texture image is too large
// http://www.khronos.org/webgl/wiki/WebGL_and_OpenGL_Differences
WebGL.scaleTextureImage = function(gl, image) {"use strict";
    var canvas, maxSize, w = image.width, h = image.height;

    maxSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);

    // max size of Canvas element
    // http://stackoverflow.com/questions/6081483/maximum-size-of-a-canvas-element
    // maxSize = Math.min(maxSize, 8196);

    // require a minimum texture size
    if (maxSize < 64) {
        return null;
    }

    if (!isPowerOfTwo(w) || !isPowerOfTwo(h)) {
        w = nextHighestPowerOfTwo(w);
        h = nextHighestPowerOfTwo(h);
    }

    // scale down if too large
    while (w > maxSize || h > maxSize) {
        w /= 2;
        h /= 2;
    }

    // scale image if dimensions must change
    if (w !== image.width || h !== image.height) {
        console.log("Scaling texture from " + image.width + "x" + image.height + " to " + w + "x" + h + " (maximum texture size is " + maxSize + ")");
        canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d").drawImage(image, 0, 0, w, h);
        image = canvas;
    }

    return image;
};

// FIXME
// texture is lost if the WebGL context is lost
// therefore don't attach any data to texture, such as texture.imageLoaded
// also should store a reference to the loaded image somewhere to avoid reloading it multiple times.
WebGL.loadStaticTexture = function(gl, url, map, texture) {"use strict";
    var image = new Image();
    // FIXME
    texture.imageLoaded = false;
    image.onload = function() {
        // make power two dimensions or reduce size
        image = WebGL.scaleTextureImage(gl, image);
        if (image === null) {
            throw new Error("Invalid texture");
        }
		//gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        /*var glError = gl.getError();
         if (glError !== 0) {
         throw new Error("Texture binding error: " + glError);
         }*/
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);

        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        // mip maps are only available for power of two dimensions
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.generateMipmap(gl.TEXTURE_2D);

        texture.imageLoaded = true;
        map.render();
    };

    // trigger image loading
    image.src = url;
};

WebGL.clear = function(gl) {"use strict";
    gl.clear(gl.COLOR_BUFFER_BIT);
};

WebGL.draw = function(gl, scale, lon0, uniforms, canvas, geometryStrips, shaderProgram) {"use strict";
    var vPositionIdx;

    gl.clear(gl.COLOR_BUFFER_BIT);
    
    //FIXME hack 
    gl.useProgram(shaderProgram);
    
    WebGL.setUniforms(gl, shaderProgram, scale, lon0, uniforms, canvas);
    
    // FIXME hack cellsize
    // FIXME cell size is equal to stripWidth in loadGeometry
    gl.uniform1f(gl.getUniformLocation(shaderProgram, "cellsize"), 1/180*Math.PI);
    
    vPositionIdx = gl.getAttribLocation(shaderProgram, 'vPosition');
    geometryStrips.forEach(function(strip) {
        gl.bindBuffer(gl.ARRAY_BUFFER, strip.buffer);
        gl.vertexAttribPointer(vPositionIdx, 2, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, strip.vertexCount);
    });
};
//
// stateful helper for binaryajax.js's BinaryFile class
// 
// modelled on Flash's ByteArray, mostly, although some names
// (int/short/long) differ in definition
//

function BinaryFileWrapper(binFile) {
    
    this.position = 0;
    this.bigEndian = true;

    this.getByte = function() {
        var byteVal = binFile.getByteAt(this.position);
        this.position++;
        return byteVal;
    };

    this.getLength = function() {
        return binFile.getLength();
    };

    this.getSByte = function() {
        var sbyte = binFile.getSByteAt(this.position);
        this.position++;
        return sbyte;
    };

    this.getShort = function() {
        var shortVal = binFile.getShortAt(this.position, this.bigEndian);
        this.position += 2;
        return shortVal;
    };
    
    this.getSShort = function() {
        var sshort = binFile.getSShortAt(this.position, this.bigEndian);
        this.position += 2;
        return sshort;
    };
    
    this.getLong = function() {
        var l = binFile.getLongAt(this.position, this.bigEndian);
        this.position += 4;
        return l;
    };
    
    this.getSLong = function() {
        var l = binFile.getSLongAt(this.position, this.bigEndian);
        this.position += 4;
        return l;
    };
    
    this.getString = function(iLength) {
        var s = binFile.getStringAt(this.position, iLength);
        this.position += iLength;
        return s;
    };

	this.getDoubleAt = function(iOffset, bBigEndian) {
		// hugs stackoverflow
		// http://stackoverflow.com/questions/1597709/convert-a-string-with-a-hex-representation-of-an-ieee-754-double-into-javascript
		// TODO: check the endianness for something other than shapefiles
		// TODO: what about NaNs and Infinity?
		var a = binFile.getLongAt(iOffset + (bBigEndian ? 0 : 4), bBigEndian);
		var b = binFile.getLongAt(iOffset + (bBigEndian ? 4 : 0), bBigEndian);
		var s = a >> 31 ? -1 : 1;
		var e = (a >> 52 - 32 & 0x7ff) - 1023;
		return s * (a & 0xfffff | 0x100000) * 1.0 / Math.pow(2,52-32) * Math.pow(2, e) + b * 1.0 / Math.pow(2, 52) * Math.pow(2, e);
	};

    this.getDouble = function() {    
        var d = this.getDoubleAt(this.position, this.bigEndian);
        this.position += 8;
        return d;
    };

    this.getChar = function() {
        var c = binFile.getCharAt(this.position);
        this.position++;
        return c;
    };
}
// ported from http://code.google.com/p/vanrijkom-flashlibs/ under LGPL v2.1

function DbfFile(binFile) {

    this.src = new BinaryFileWrapper(binFile);

    var t1 = new Date().getTime();

    this.header = new DbfHeader(this.src);

    var t2 = new Date().getTime();
    //if (window.console && window.console.log) console.log('parsed dbf header in ' + (t2-t1) + ' ms');

    t1 = new Date().getTime();

    // TODO: could maybe be smarter about this and only parse these on demand
    this.records = [];
    for(var i = 0; i < this.header.recordCount; i++) {
        var record = this.getRecord(i);
        this.records.push(record);
    }

    t2 = new Date().getTime();
    //if (window.console && window.console.log) console.log('parsed dbf records in ' + (t2-t1) + ' ms');

}

DbfFile.prototype.getRecord = function(index) {

    if(index > this.header.recordCount) {
        throw (new DbfError("", DbfError.ERROR_OUTOFBOUNDS));
    }

    this.src.position = this.header.recordsOffset + index * this.header.recordSize;
    this.src.bigEndian = false;

    return new DbfRecord(this.src, this.header);
};

function DbfHeader(src) {

    // endian:
    src.bigEndian = false;

    this.version = src.getSByte();
    this.updateYear = 1900 + src.getByte();
    this.updateMonth = src.getByte();
    this.updateDay = src.getByte();
    this.recordCount = src.getLong();
    this.headerSize = src.getShort();
    this.recordSize = src.getShort();

    //skip 2:
    src.position += 2;

    this.incompleteTransaction = src.getByte();
    this.encrypted = src.getByte();

    // skip 12:
    src.position += 12;

    this.mdx = src.getByte();
    this.language = src.getByte();

    // skip 2;
    src.position += 2;

    // iterate field descriptors:
    this.fields = [];
    while(src.getSByte() != 0x0D) {
        src.position -= 1;
        this.fields.push(new DbfField(src));
    }

    this.recordsOffset = this.headerSize + 1;

}

function DbfField(src) {

    this.name = this.readZeroTermANSIString(src);

    // fixed length: 10, so:
    src.position += (10 - this.name.length);

    this.type = src.getByte();
    this.address = src.getLong();
    this.length = src.getByte();
    this.decimals = src.getByte();

    // skip 2:
    src.position += 2;

    this.id = src.getByte();

    // skip 2:
    src.position += 2;

    this.setFlag = src.getByte();

    // skip 7:
    src.position += 7;

    this.indexFlag = src.getByte();
}

DbfField.prototype.readZeroTermANSIString = function(src) {
    var r = [];
    var b;
    while( b = src.getByte()) {
        r[r.length] = String.fromCharCode(b);
    }
    return r.join('');
};

function DbfRecord(src, header) {
    this.offset = src.position;
    this.values = {};
    for(var i = 0; i < header.fields.length; i++) {
        var field = header.fields[i];
        var stringValue = src.getString(field.length);
        
        // FIXME
        // a hack to convert strings to floats
        var floatValue = parseFloat(stringValue);
        if(isNaN(floatValue)) {
            this.values[field.name] = stringValue;
        } else {
            this.values[field.name] = stringValue;
        }
    }
}
// FIXME global variable for event handling
distanceTool = null; // replace by observer pattern

function DistanceTool(style) {"use strict";
    
    DistanceTool.prototype = new AbstractLayer();
    AbstractLayer.call(this, style);
    
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


/**
 * Graticule is a map layer drawing a network of parallels and meridians
 * @param {Object} style The graphical style to apply.
 * @param {Object} scaleVisibility The visibility range.
 * @param {Object} poleRadiusPx The radius of the dot drawn on poles in pixels.
 * @param {Object} poleDistPx The distance between the poles and the end of meridian lines in pixels.
 */
function Graticule(style, scaleVisibility, poleRadiusPx, poleDistPx) {"use strict";

    Graticule.prototype = new AbstractLayer();
    AbstractLayer.call(this, style, scaleVisibility);

    // if the graticule spacing is larger than this value, no meridians are pruned at poles.
    var MIN_PRUNING_SPACING = 30 / 180 * Math.PI;
    var MAX_ANGLE_COS = Math.cos(177 * Math.PI / 180);
    var MAX_RECURSION = 20;
    var MAX_SEGMENT_LENGTH = 5;

    var EPS = 1.0e-7;

    // FIXME remove graticule
    var graticule = this;

    var maxLengthSquare;

    Graticule.GRATICULE_DIV = 10;
    Graticule.getGraticuleSpacing = function(relativeMapScale) {

        // FIXME: make this configurable
        var d = 5;
        if (relativeMapScale < 1.5) {
            d = 45;
        } else if (relativeMapScale < 3) {
            d = 30;
        } else if (relativeMapScale < 6) {
            d = 15;
        } else if (relativeMapScale < 13) {
            d = 10;
        }
        return d * Math.PI / 180;
    };

    function drawCurvedLineSegment(projection, rotation, ctx, lonStart, lonEnd, latStart, latEnd, poleDist, callCounter, startXY) {

        function projectWithPoleDist(lon, lat, xy, poleDist) {
            // keep a minimum distance to the poles
            // add a distance of EPS to avoid lines that are converging towards the projected poles
            if (lat > Math.PI / 2 - poleDist - EPS) {
                lat = Math.PI / 2 - poleDist - EPS;
            }
            if (lat < -Math.PI / 2 + poleDist + EPS) {
                lat = -Math.PI / 2 + poleDist + EPS;
            }
            if (rotation) {
                rotation.transform(lon, lat, xy);
                projection.forward(xy[0], xy[1], xy);
            } else {
                projection.forward(lon, lat, xy);
            }
        }

        function needsRefinement(x0, y0, x1, y1, x2, y2) {
            var length1Sq, length2Sq, cos_alpha;

            x1 = x1 - x0;
            y1 = y1 - y0;
            x2 = x2 - x0;
            y2 = y2 - y0;
            length1Sq = x1 * x1 + y1 * y1;
            length2Sq = x2 * x2 + y2 * y2;

            // make sure segments are not too long, which causes the line to leave non-convex graticules
            if (length1Sq > maxLengthSquare || length2Sq > maxLengthSquare) {
                return true;
            }
            // test angle betweeen line segments
            cos_alpha = (x1 * x2 + y1 * y2) / (Math.sqrt(length1Sq) * Math.sqrt(length2Sq));
            // the angle has to be close to 180 degrees
            return cos_alpha > MAX_ANGLE_COS;
        }

        var xy = [],
        // start point
        x1 = startXY[0], y1 = startXY[1],
        // middle point
        lonMiddle = (lonStart + lonEnd) / 2, latMiddle = (latStart + latEnd) / 2, xm, ym,
        // end point
        x2, y2;

        // end point
        projectWithPoleDist(lonEnd, latEnd, xy, poleDist);
        x2 = xy[0];
        y2 = xy[1];

        // middle point
        projectWithPoleDist(lonMiddle, latMiddle, xy, poleDist);
        xm = xy[0];
        ym = xy[1];

        if (callCounter < MAX_RECURSION && needsRefinement(xm, ym, x1, y1, x2, y2)) {
            drawCurvedLineSegment(projection, rotation, ctx, lonStart, lonMiddle, latStart, latMiddle, poleDist, callCounter += 1, startXY);
            startXY[0] = xm;
            startXY[1] = ym;
            drawCurvedLineSegment(projection, rotation, ctx, lonMiddle, lonEnd, latMiddle, latEnd, poleDist, callCounter += 1, startXY);
        } else {
            ctx.lineTo(xm, ym);
            ctx.lineTo(x2, y2);
            startXY[0] = x2;
            startXY[1] = y2;
        }
    }


    Graticule.addParallelPathToCanvas = function(projection, rotation, ctx, lat, west, east, lineSegment) {

        function addParallelPathToCanvasPart(west, east) {
            var pt = [], x, y, prevX, prevY, lon, i, nSegments;

            if (rotation) {
                rotation.transform(west, lat, pt);
                projection.forward(pt[0], pt[1], pt);
            } else {
                projection.forward(west, lat, pt);
            }
            ctx.moveTo(pt[0], pt[1]);

            nSegments = Math.floor((east - west) / lineSegment) - 1;
            for ( i = 0; i < nSegments; i += 1) {
                lon = west + i * lineSegment;
                drawCurvedLineSegment(projection, rotation, ctx, lon, lon + lineSegment, lat, lat, 0, 0, pt);
            }

            // add the last segment
            lon += lineSegment;
            drawCurvedLineSegment(projection, rotation, ctx, lon, east - EPS, lat, lat, 0, 0, pt);
        }

        // split the parallel in 2 pieces along the center of the map to avoid horizontal lines
        // connecting the left and right graticule border when the globe is rotated.
        addParallelPathToCanvasPart(west, -EPS);
        addParallelPathToCanvasPart(EPS, east);
    };

    function addMeridianPathToCanvas(ctx, lon, firstParallelID, lastParallelID, latitudeDist, poleDist) {
        var xy = [], nSegments = Graticule.GRATICULE_DIV, segLength = latitudeDist / nSegments, lat, parallelID, seg;

        // FIXME
        lat = Math.max(firstParallelID * latitudeDist, -Math.PI / 2 + poleDist);
        if (graticule.rotation) {
            graticule.rotation.transform(lon, lat, xy);
            graticule.projection.forward(xy[0], xy[1], xy);
        } else {
            graticule.projection.forward(lon, lat, xy);
        }

        ctx.moveTo(xy[0], xy[1]);

        for ( parallelID = firstParallelID; parallelID < lastParallelID; parallelID += 1) {
            for ( seg = 0; seg < nSegments; seg += 1) {
                lat = parallelID * latitudeDist + seg * segLength;
                drawCurvedLineSegment(graticule.projection, graticule.rotation, ctx, lon, lon, lat, lat + segLength, poleDist, 0, xy);
            }
        }
    }


    this.drawPole = function(ctx, lat) {
        var xy = [], r;
        r = poleRadiusPx / this.mapScale;

        // reduce the radius for small scale
        // FIXME this should be relative to the graticule height
        // FIXME this should be definable in MapContent
        r = Math.min(r, this.canvas.height / 1000);

        if (graticule.rotation) {
            graticule.rotation.transform(0, lat, xy);
            this.projection.forward(xy[0], xy[1], xy);
        } else {
            this.projection.forward(0, lat, xy);
        }
        this.drawCircle(ctx, xy, r);
        ctx.fill();

        // If the pole is not centered on the map, the globe is rotated before projection.
        // Draw a second pole mirrored along the central meridian for this case.
        if (Math.abs(xy[0]) > EPS) {
            xy[0] = -xy[0];
            this.drawCircle(ctx, xy, r);
            ctx.fill();
        }
    };

    this.render = function(fastRender, zoomToMap) {

        var shortenMeridiansNearPoles, meridianID, parallelID, bb, d, ctx, spacing, lineSegment, lon0, dLon0, nParallelsOnSphere, firstMeridianID, lastMeridianID, firstParallelID, lastParallelID, lon0ID, poleDist, southID, northID;

        if (!this.isVisible()) {
            return;
        }

        // compute the maximum length of a segment depending on the current map scale.
        d = MAX_SEGMENT_LENGTH / graticule.mapScale;
        maxLengthSquare = d * d;

        ctx = this.canvas.getContext('2d');
        this.applyStyle(ctx);
        this.setupTransformation(ctx);

        if (zoomToMap) {
            bb = this.visibleGeographicBoundingBoxCenteredOnLon0;
        } else {
            bb = {
                west : -Math.PI,
                east : Math.PI,
                north : Math.PI / 2,
                south : -Math.PI / 2
            };
        }
        spacing = Graticule.getGraticuleSpacing(this.relativeMapScale);
        if (!zoomToMap) {
            spacing = Math.max(spacing, 30 * Math.PI / 180);
        }
        lineSegment = spacing / Graticule.GRATICULE_DIV;
        lon0 = this.mapCenter.lon0;
        dLon0 = lon0 % spacing;
        nParallelsOnSphere = Math.round(Math.PI / spacing);

        // longitude of first (west-most) meridian
        firstMeridianID = Math.floor(bb.west / spacing);
        if (firstMeridianID * spacing - dLon0 < -Math.PI) {
            firstMeridianID += 1;
        }

        // longitude of last (east-most) meridian
        lastMeridianID = Math.ceil(bb.east / spacing);
        if (lastMeridianID * spacing - dLon0 > Math.PI) {
            lastMeridianID -= 1;
        }

        // latitude of first (south-most) parallel
        firstParallelID = Math.floor(bb.south / spacing);
        if (this.southPoleVisible) {
            firstParallelID = -Math.round(Math.PI / 2 / spacing);
        }

        // latitude of last (north-most) parallel
        lastParallelID = Math.ceil(bb.north / spacing);
        if (this.northPoleVisible) {
            lastParallelID = Math.round(Math.PI / 2 / spacing);
        }

        // find out whether poles should be drawn as points and meridians shortened near poles
        var POLE_TOL = 0.3 / 180 * Math.PI;
        if (this.relativeMapScale < this.map.getScaleLimits()[0]) {
            // A world map projection is used and the map is only partially visible.
            // Only draw poles as dots if the map is rotated.
            shortenMeridiansNearPoles = this.map.isRotateSmallScale() && Math.abs(this.map.getCentralLatitude()) > POLE_TOL;
        } else {
            // A world map projection is used and the entire globe is visible, or a projection
            // for medium or large scales is used.
            // Draw the poles as dots if the central latitude is not the equator
            shortenMeridiansNearPoles = Math.abs(this.map.getCentralLatitude()) > POLE_TOL;
        }
        poleDist = shortenMeridiansNearPoles ? (poleDistPx / this.mapScale) : 0;

        // id of the central meridian
        lon0ID = lon0 < 0 ? Math.ceil(lon0 / spacing) : Math.floor(lon0 / spacing);
        // draw meridians
        ctx.beginPath();
        for ( meridianID = firstMeridianID; meridianID <= lastMeridianID; meridianID += 1) {
            southID = firstParallelID;
            northID = lastParallelID;

            if (spacing < MIN_PRUNING_SPACING) {
                // prune meridian if it ends at the north pole
                if (lastParallelID >= nParallelsOnSphere / 2 && (meridianID + lon0ID) % 4 !== 0) {
                    northID -= 1;
                }
                // prune meridian if it ends at the parallel next to the north pole
                if ((lastParallelID >= nParallelsOnSphere / 2 - 1) && (meridianID + lon0ID) % 2 !== 0) {
                    // prune every other of those that do not reach the pole
                    northID -= 1;
                }
                // prune meridian if it ends at the south pole
                if (firstParallelID <= -nParallelsOnSphere / 2 && (meridianID + lon0ID) % 4 !== 0) {
                    southID += 1;
                }
                // prune meridian if it ends at the parallel next to the south pole
                if ((firstParallelID <= -nParallelsOnSphere / 2 + 1) && (meridianID + lon0ID) % 2 !== 0) {
                    southID += 1;
                }
            }
            addMeridianPathToCanvas(ctx, meridianID * spacing - dLon0, southID, northID, spacing, poleDist);
        }

        // draw parallels
        if (firstParallelID === -nParallelsOnSphere / 2) {
            // don't draw north pole as a line
            firstParallelID += 1;
        }
        if (lastParallelID === nParallelsOnSphere / 2) {
            // don't draw south pole as a line
            lastParallelID -= 1;
        }
        for ( parallelID = firstParallelID; parallelID <= lastParallelID; parallelID += 1) {
            Graticule.addParallelPathToCanvas(this.projection, this.rotation, ctx, parallelID * spacing, bb.west, bb.east, lineSegment);
        }
        ctx.stroke();

        // draw dots at north and south pole
        if (shortenMeridiansNearPoles) {
            this.drawPole(ctx, Math.PI / 2);
            this.drawPole(ctx, -Math.PI / 2);
        }
    };

}
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
function pointsDegreeToRadian(records) {
	var i, nRecords, c = Math.PI / 180, shp;
	for ( i = 0, nRecords = records.length; i < nRecords; i += 1) {
		shp = records[i].shape;
		shp.x *= c;
		shp.y *= c;
	}
}

function linesDegreeToRadian(records) {

	var c = Math.PI / 180, nRecords, nRings, nVertices, i, j, ring, k, lon, lat, xMin, xMax, yMin, yMax, shp;
	for ( i = 0, nRecords = records.length; i < nRecords; i += 1) {
		shp = records[i].shape;
		xMin = Number.MAX_VALUE;
		xMax = -Number.MAX_VALUE;
		yMin = Number.MAX_VALUE;
		yMax = -Number.MAX_VALUE;

		for ( j = 0, nRings = shp.rings.length; j < nRings; j += 1) {
			ring = shp.rings[j];
			for ( k = 0, nVertices = ring.length; k < nVertices; k += 2) {
				lon = ring[k] * c;

				if (lon > xMax) {
					xMax = lon;
				}
				if (lon < xMin) {
					xMin = lon;
				}
				ring[k] = lon;

				lat = ring[k + 1] * c;

				// clamp to +/-PI/2
				//FIXME: is this needed or not?
				if (lat > Math.PI / 2) {
					lat = Math.PI / 2;
				} else if (lat < -Math.PI / 2) {
					lat = -Math.PI / 2;
				}

				if (lat > yMax) {
					yMax = lat;
				}
				if (lat < yMin) {
					yMin = lat;
				}
				ring[k + 1] = lat;
			}
		}
		shp.box.xMin = xMin;
		shp.box.xMax = xMax;
		shp.box.yMin = yMin;
		shp.box.yMax = yMax;
	}
}

function removePoleBox(records) {

	var EPS = 1.0e-6;

	// FIXME remove variable
	var c = Math.PI / 180, nRecords, nRings, nVertices, i, j, ring, k, lon, lat, xMin, xMax, yMin, yMax, shp, lat;
	for ( i = 0, nRecords = records.length; i < nRecords; i += 1) {
		shp = records[i].shape;

		// FIXME do the same for the north pole

		// FIXME search for two consecutive points on the pole
		
		if (Math.abs(shp.box.yMin + Math.PI / 2) < EPS) {
			
			shp.ringsWithPoleBox = [];
			
			for ( j = 0, nRings = shp.rings.length; j < nRings; j += 1) {
				ring = shp.rings[j];
				
				
				// copy original
				shp.ringsWithPoleBox[j] = ring.slice(0);
				// FIXME: use this for point-in-polygon test for the azimuthal projecion
				// FIXME optionally move this to the clipping algorithm
				for ( k = 0, nVertices = ring.length; k < nVertices; k += 2) {
					lat = ring[k + 1];
					if (Math.abs(lat + Math.PI / 2) < EPS) {
						ring.splice(k, 2);
						k -= 2;
					}
				}
				
			}
			
		}
	}
}

function loadGeoJson(data) {

	data = JSON.parse(data);

	var degToRad = Math.PI / 180;
	var geometry = [];
	var attributes = {
		fieldNames : [],
		fields : []
	};
	var i, j;
	for ( i = 0; i < data.features.length; i += 1) {
		var f = data.features[i];
		var geom = f.geometry;
		if (geom.type === "MultiLineString") {
			var xMin = Number.MAX_VALUE;
			var xMax = -Number.MAX_VALUE;
			var yMin = Number.MAX_VALUE;
			var yMax = -Number.MAX_VALUE;

			var line = {
				box : {},
				rings : [],
				type : null
			};

			var ring = [];
			var coords = geom.coordinates[0];
			for ( j = 0; j < coords.length; j += 1) {
				var pt = coords[j];
				var lon = pt[0];
				var lat = pt[1];
				if (lon > xMax) {
					xMax = lon;
				}
				if (lon < xMin) {
					xMin = lon;
				}
				if (lat > yMax) {
					yMax = lat;
				}
				if (lat < yMin) {
					yMin = lat;
				}

				ring.push(lon * Math.PI / 180);
				ring.push(lat * Math.PI / 180);
			}
			line.rings.push(ring);
			line.type = ShpType.SHAPE_POLYLINE;
			line.box.xMin = xMin * Math.PI / 180;
			line.box.xMax = xMax * Math.PI / 180;
			line.box.yMin = yMin * Math.PI / 180;
			line.box.yMax = yMax * Math.PI / 180;
			geometry.push(line);
		}
	}

	gLayer.geometry = geometry;
	gLayer.featureType = ShpType.SHAPE_POLYLINE;
	gLayer.attributes = attributes;
	map.render();
}

function wfsReaderCrossServer() {

	var webAddress = "http://cartography.geo.oregonstate.edu:8085/geoserver/ows";
	var wfsRequest = "?service=WFS&version=1.0.0&request=GetFeature&typeName=";
	var layerName = "naturalearth:ne_110m_rivers_lake_centerlines";
	var JSONP_GEOSERVER = "&outputFormat=json&format_options=callback:loadGeoJson";

	var geoJsonUrl = webAddress + wfsRequest + layerName + JSONP_GEOSERVER;
	$.ajax({
		url : geoJsonUrl,
		dataType : 'jsonp'
	});
}

function wfsReader(url) {
	var url = "http://cartography.geo.oregonstate.edu:8085/geoserver/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=naturalearth:ne_110m_rivers_lake_centerlines&outputFormat=json";
	loadData(url, loadGeoJson);
}

function shapefileReader(url, layerLoadCallback) {

	var geometry, featureType, attributes;

	function onShpFail() {
		throw ('Failed to load geometry of shapefile at ' + url);
	}

	function onDbfFail() {
		throw ('Failed to load attributes of shapefile at ' + url);
	}

	function onShpComplete(oHTTP) {
		var i, shpFile = new ShpFile(oHTTP.binaryResponse);

		// convert geometry from degrees to radians
		var shapeType = shpFile.header.shapeType;
		if (shapeType === ShpType.SHAPE_POLYGON || shapeType == ShpType.SHAPE_POLYLINE) {
			linesDegreeToRadian(shpFile.records);
			removePoleBox(shpFile.records);
		} else if (shapeType === ShpType.SHAPE_POINT) {
			pointsDegreeToRadian(shpFile.records);
		}
		geometry = [];
		for ( i = 0, nShapes = shpFile.records.length; i < nShapes; i += 1) {
			geometry.push(shpFile.records[i].shape);
		}
		featureType = shpFile.header.shapeType;
		if (attributes) {
			layerLoadCallback(geometry, featureType, attributes);
		}
	}

	function onDbfComplete(oHTTP) {
		var fieldID, recordID, dbfFile = new DbfFile(oHTTP.binaryResponse);
		attributes = {
			fieldNames : [],
			fields : []
		};

		for ( fieldID = 0, nFields = dbfFile.header.fields.length; fieldID < nFields; fieldID += 1) {
			var fieldName = dbfFile.header.fields[fieldID].name;
			attributes.fieldNames.push(fieldName);
			var column = [];
			for ( recordID = 0, nRecords = dbfFile.header.recordCount; recordID < nRecords; recordID += 1) {
				column.push(dbfFile.records[recordID].values[fieldName]);
			}
			attributes.fields.push(column);
		}

		if (geometry) {
			layerLoadCallback(geometry, featureType, attributes);
		}
	}

	new BinaryAjax(url + '.shp', onShpComplete, onShpFail);
	new BinaryAjax(url + '.dbf', onDbfComplete, onDbfFail);
}

function AbstractLayer(style, scaleVisibility) {"use strict";

	this.style = style;

	// interpolated scale-dependent line width. Use instead of this.style.lineWidth
	this.lineWidth = null;

	this.applyStyle = function(ctx) {
		var p;

		if (this.style instanceof Object) {
			for (p in this.style) {
				if (this.style.hasOwnProperty(p) && !p.startsWith('AM_')) {
					ctx[p] = this.style[p];
				}
			}
		}

		if (style.hasOwnProperty("lineWidth")) {
			// interpolate scale-dependent line width if a series of values is specified
			this.lineWidth = AbstractLayer.getScaleInterpolatedValue(style.lineWidth, "width", this.relativeMapScale);
			ctx.lineWidth = this.lineWidth / this.mapScale;
		}
	};
	
	this.getVerticalShift = function() {
		if (typeof this.projection.getFalseNorthing === 'function') {
			return this.projection.getFalseNorthing();
		} else {
			return 0;
		}
	};
	
	this.setupTransformation = function(ctx, canvasWidth, canvasHeight) {
		// setup a transformation corresponding to
		// x = canvas.width / 2 + x * mapScale
		// y = canvas.height / 2 - dy - y * mapScale
		var dy = this.getVerticalShift() * this.mapScale;
		ctx.setTransform(this.mapScale, 0, 0, -this.mapScale, this.canvas.width / 2, this.canvas.height / 2 - dy);
	};

	this.isVisible = function() {
		if ( scaleVisibility instanceof Object === false) {
			return true;
		}
		if (this.relativeMapScale < scaleVisibility.layerMinScale || this.relativeMapScale >= scaleVisibility.layerMaxScale) {
			return false;
		}
		return true;
	};

	/**
	 * Returns whether a point in geographic coordinates is inside the bounding box around the viewport
	 *  in geographic coordinates. This is not a rectangle on the map, but a quadrilateral on the sphere, which surrounds the map.
	 */
	this.isPointInGeographicBoundingBox = function(lon, lat) {
		var viewPortBB = this.visibleGeographicBoundingBoxCenteredOnLon0, lon0 = this.mapCenter.lon0;
		lon = adjlon(lon - lon0);
		return !(lat > viewPortBB.north || lat < viewPortBB.south || lon > viewPortBB.east || lon < viewPortBB.west);
	};

	this.load = function(m) {
	};

	this.drawCircle = function(ctx, xy, r) {
		ctx.beginPath();
		ctx.arc(xy[0], xy[1], r, 0, Math.PI * 2, false);
		ctx.closePath();
	};

	/**
	 * Linearly interpolates a value with scale. The value is defined by a series of
	 * scale - value pairs stored in an array.
	 */
	AbstractLayer.getScaleInterpolatedValue = function(values, valName, relativeMapScale) {

		var rec1, rec2, i, w;

		// interpolate dimension with scale
		if (Array.isArray(values)) {
			if (values.length === 0) {
				return undefined;
			}
			if (values.length === 1) {
				return values[0][valName];
			}

			// map scale is larger than the largest scale in the input array
			if (relativeMapScale > values[values.length - 1].scale) {
				return values[values.length - 1][valName];
			}

			// interpolate value
			for ( i = values.length - 2; i >= 0; i -= 1) {
				rec1 = values[i];
				if (relativeMapScale >= rec1.scale) {
					rec2 = values[i + 1];
					w = (relativeMapScale - rec1.scale) / (rec2.scale - rec1.scale);
					return (1 - w) * rec1[valName] + w * rec2[valName];
				}
			}
		}

		return values;
	};

	this.getAttributeFieldID = function(fieldName) {
		var i, nFieldNames;
		for ( i = 0, nFieldNames = this.attributes.fieldNames.length; i < nFieldNames; i += 1) {
			if (this.attributes.fieldNames[i] === fieldName) {
				return i;
			}
		}
		return -1;
	};

	this.getAttributeField = function(fieldName) {
		var fieldID = this.getAttributeFieldID(fieldName);
		if (fieldID >= 0) {
			return this.attributes.fields[fieldID];
		}
		return null;
	};
	
}
function PointLayer(url, style, scaleVisibility) {"use strict";

    PointLayer.prototype = new AbstractLayer();
    AbstractLayer.call(this, style, scaleVisibility);

    this.drawSquareSymbol = function(ctx, xy, outterD, outterFill, outterStroke, outterLineWidth, innerSymbol) {
        var r = outterD * 0.5, innerD = innerSymbol.d, innerR = innerD * 0.5, x = xy[0], y = xy[1];

        // outter rectangle
        if (outterStroke !== null) {
            ctx.fillRect(x - r, y - r, outterD, outterD);
        }
        if (outterStroke !== null) {
            ctx.strokeRect(x - r, y - r, outterD, outterD);
        }

        // inner rectangle
        if (innerSymbol !== null) {
            ctx.fillStyle = innerSymbol.fill;
            ctx.fillRect(x - innerR, y - innerR, innerD, innerD);
            ctx.fillStyle = outterFill;
        }
        if (innerSymbol !== null) {
            ctx.strokeStyle = innerSymbol.stroke;
            ctx.lineWidth = innerSymbol.lineWidth;
            ctx.strokeRect(x - innerR, y - innerR, innerD, innerD);
            ctx.strokeStyle = outterStroke;
            ctx.lineWidth = outterLineWidth;
        }
    };

    this.drawCircleSymbol = function(ctx, xy, outterD, outterFill, outterStroke, outterLineWidth, innerSymbol) {
        // outter circle
        this.drawCircle(ctx, xy, outterD * 0.5);
        if (outterFill !== null) {
            ctx.fill();
        }
        if (outterStroke !== null) {
            ctx.stroke();
        }

        // inner circle
        if (innerSymbol !== null) {
            this.drawCircle(ctx, xy, innerSymbol.d * 0.5);
            if (innerSymbol.fill !== null) {
                ctx.fillStyle = innerSymbol.fill;
                ctx.fill();
                if (outterFill !== null) {
                    ctx.fillStyle = outterFill;
                }
            }

            if (innerSymbol.stroke !== null) {
                ctx.strokeStyle = innerSymbol.stroke;
                ctx.lineWidth = innerSymbol.lineWidth;
                ctx.stroke();
                if (outterStroke !== null) {
                    ctx.strokeStyle = outterStroke;
                }
                if (outterLineWidth !== null) {
                    ctx.lineWidth = outterLineWidth;
                }
            }
        }
    };

    this.renderPoints = function(ctx) {

        var xy = [], d, innerSymbol, outterFill, outterStroke, outterLineWidth, squareSymbol, i, nRecords, pt, lon, lat, viewPortBB, lon0;
        if (!this.style.hasOwnProperty("AM_symbolDim") || this.style.AM_symbolDim <= 0) {
            return;
        }

        d = AbstractLayer.getScaleInterpolatedValue(this.style.AM_symbolDim, "dim", this.relativeMapScale) / this.mapScale;
        outterFill = this.style.hasOwnProperty("fillStyle") ? this.style.fillStyle : null;
        outterStroke = this.style.hasOwnProperty("strokeStyle") ? this.style.strokeStyle : null;
        outterLineWidth = this.style.lineWidth / this.mapScale;
        squareSymbol = this.style.hasOwnProperty("AM_symbolType") && this.style.AM_symbolType === 'square';
        
        // optional nested inner point symbol
        if (this.style.hasOwnProperty("AM_symbolDim2")) {
            innerSymbol = {
                fill : this.style.hasOwnProperty("AM_fillStyle2") ? this.style.AM_fillStyle2 : null,
                stroke : this.style.hasOwnProperty("AM_strokeStyle2") ? this.style.AM_strokeStyle2 : null,
                lineWidth : this.style.hasOwnProperty("AM_lineWidth2") ? this.style.AM_lineWidth2 / this.mapScale : null,
                d : AbstractLayer.getScaleInterpolatedValue(style.AM_symbolDim2, "dim", this.relativeMapScale) / this.mapScale
            };
        } else {
            innerSymbol = null;
        }

        this.setupTransformation(ctx);
        lon0 = this.mapCenter.lon0;
        
        // a bounding box around the viewport in geographic coordinates. This is not a rectangle on the map,
        // but a quadrilateral on the sphere, surrounding the map.
        viewPortBB = this.visibleGeographicBoundingBoxCenteredOnLon0;

        for ( i = 0, nRecords = this.geometry.length; i < nRecords; i += 1) {
            pt = this.geometry[i];
            lon = pt.x;
            lat = pt.y;

            // only project the feature if it is inside the viewport (in geographic coordinates)
            // features may still be outside the map viewport after projection
            lon = adjlon(lon - lon0);
            if (!(lat > viewPortBB.north || lat < viewPortBB.south || lon > viewPortBB.east || lon < viewPortBB.west)) {
                this.projection.forward(lon, lat, xy);
                if (squareSymbol) {
                    this.drawSquareSymbol(ctx, xy, d, outterFill, outterStroke, outterLineWidth, innerSymbol);
                } else {
                    this.drawCircleSymbol(ctx, xy, d, outterFill, outterStroke, outterLineWidth, innerSymbol);
                }
            }

        }
    };

    this.applyLabelStyle = function(ctx) {
        var cssFontElements, i, fontSize;

        this.applyStyle(ctx);

        // set styles for text rendering
        if (this.style.AM_labelColor) {
            ctx.fillStyle = this.style.AM_labelColor;
        }
        if (this.style.AM_haloColor) {
            ctx.strokeStyle = this.style.AM_haloColor;
        }
        // replace scaled stroke width with original unscaled halo width
        ctx.lineWidth = this.style.AM_labelHaloWidth;


        if (style.hasOwnProperty("AM_fontSize") && Array.isArray(style.AM_fontSize) && style.AM_fontSize.length > 0) {
            // interpolate scale-dependent font size
            fontSize = AbstractLayer.getScaleInterpolatedValue(style.AM_fontSize, "fontSize", this.relativeMapScale);
            ctx.font = this.style.font.replace("#", fontSize.toFixed(1));
        } else {
            // extract font size from css font string
            cssFontElements = this.style.font.split(" ");
            for ( i = 0; i < cssFontElements.length; i += 1) {
                if (cssFontElements[i].endsWith("px")) {
                    fontSize = parseFloat(cssFontElements[i]);
                    break;
                }
            }
        }

        return fontSize;
    };

    // interpolate position of label along label track
    function interpolateLabelPosition(pt) {
        // FIXME place variables at beginning
        if (pt.labelTrack) {
            var track = pt.labelTrack;
            var trackPt = track[track.length - 1];
            if (layer.relativeMapScale > trackPt.scale) {
                lon = trackPt.lon;
                lat = trackPt.lat;
            } else {
                var trackPtID;
                for ( trackPtID = track.length - 2; trackPtID >= 0; trackPtID -= 1) {
                    var trackPt1 = track[trackPtID];
                    var scaleLim = trackPt1.scale;
                    if (layer.relativeMapScale > scaleLim) {
                        var trackPt2 = track[trackPtID + 1];
                        var w = (layer.relativeMapScale - scaleLim) / (trackPt2.scale - trackPt1.scale);
                        lon = (1 - w) * trackPt1.lon + w * trackPt2.lon;
                        lat = (1 - w) * trackPt1.lat + w * trackPt2.lat;
                        break;
                    }
                }
            }
        }
    }

    function alignLabel(ctx, pt, align, offsetX, offsetY, fontSize) {
        switch (align) {
            case "topRight":
                ctx.textAlign = "left";
                ctx.textBaseline = "bottom";
                pt[0] += offsetX;
                pt[1] += offsetY;
                break;
            case "right":
                ctx.textAlign = "left";
                ctx.textBaseline = "middle";
                pt[0] += offsetX * 2;
                break;
            case "bottomRight":
                ctx.textAlign = "left";
                ctx.textBaseline = "bottom";
                pt[0] += offsetX;
                pt[1] -= offsetY + fontSize;
                break;
            case "bottom":
                ctx.textAlign = "center";
                ctx.textBaseline = "bottom";
                pt[1] -= offsetY + fontSize;
                break;
            case "bottomLeft":
                ctx.textAlign = "right";
                ctx.textBaseline = "bottom";
                pt[0] -= offsetX;
                pt[1] -= offsetY + fontSize;
                break;
            case "left":
                ctx.textAlign = "right";
                ctx.textBaseline = "middle";
                pt[0] -= offsetX * 2;
                break;
            case "topLeft":
                ctx.textAlign = "right";
                ctx.textBaseline = "bottom";
                pt[0] -= offsetX;
                pt[1] += offsetY;
                break;
            case "top":
                ctx.textAlign = "center";
                ctx.textBaseline = "bottom";
                pt[1] += offsetY;
                break;
            case "center":
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                break;
            default:
                ctx.textAlign = "left";
                ctx.textBaseline = "alphabetic";
                pt[0] += offsetX;
                pt[1] += offsetY;
        }
    }

    /**
     * Fill and stroke a label, distribute each element in the array on a separate line.
     */
    function drawLabel(ctx, labels, x, y, lineHeight, stroke, fill, fastRender) {
        var l, t;
        for ( l = 0; l < labels.length; l += 1) {
            t = labels[l];

            // add spaces to simulate tracking
            // FIXME this should be done once when loading the data
            //          if (tracking) {
            //                t = t.replace(/(.)/g, trackingReplacementStr)
            //            }

            if (stroke && !fastRender) {
                ctx.strokeText(t, x, -y);
            }
            if (fill) {
                ctx.fillText(t, x, -y);
            }

            y -= lineHeight;
        }
    }


    this.renderLabels = function(ctx, fastRender) {

        var xy = [], label, labelRows, fill, stroke, toUpperCase, lineHeight, tracking, trackingReplacementStr, alignColumn, alignField, align, labelField, lon0, dy, fontSize, offsetX, offsetY, viewPortBB, track, lon, lat, pt, x, y, i, nRecords;

        // appearance
        fill = this.style.hasOwnProperty("AM_labelColor");
        stroke = this.style.hasOwnProperty("AM_haloColor");
        fontSize = this.applyLabelStyle(ctx);
        lineHeight = (style.hasOwnProperty("AM_lineHeight") && this.style.AM_lineHeight > 0) ? this.style.AM_lineHeight : 16;

        // upper case
        toUpperCase = this.style.hasOwnProperty("AM_toUpperCase") && this.style.AM_toUpperCase === true;

        // tracking
        trackingReplacementStr = null;
        if (style.hasOwnProperty("AM_tracking")) {
            trackingReplacementStr = "$1";
            for ( i = 0; i < this.style.AM_tracking; i += 1) {
                trackingReplacementStr += " ";
            }
        }

        // label offset relative to font size
        offsetX = this.style.hasOwnProperty("AM_labelOffsetX") ? this.style.AM_labelOffsetX * fontSize : 0;
        offsetY = this.style.hasOwnProperty("AM_labelOffsetY") ? this.style.AM_labelOffsetY * fontSize : 0;

        // alignment
        // if textAlign is not a valid Canvas property, the value is the name of a feature attribute
        if (["center", "left", "right", "start", "end"].indexOf(style.textAlign) < 0) {
            alignColumn = this.style.textAlign;
        } else {
            alignColumn = null;
        }
        alignField = this.getAttributeField(alignColumn);

        // text
        labelField = this.getAttributeField(style.AM_textProp);

        // projection
        lon0 = this.mapCenter.lon0;
        dy = this.getVerticalShift() * this.mapScale;
        ctx.setTransform(1, 0, 0, 1, this.canvas.width / 2, this.canvas.height / 2 - dy);

        // a bounding box around the viewport in geographic coordinates. This is not a rectangle on the map,
        // but a rectangle on the sphere, surrounding the map.
        viewPortBB = this.visibleGeographicBoundingBoxCenteredOnLon0;

        for ( i = 0, nRecords = this.geometry.length; i < nRecords; i += 1) {

            /*
             FIXME
             var field = getAttributeField(scaleVisibility.featureMinScaleAtt);
             // only draw the feature if the scale is large enough
             if (scaleVisibility && scaleVisibility.featureMinScaleAtt) {
             var featureMinScale = dataRecord.values[scaleVisibility.featureMinScaleAtt];
             if (featureMinScale > layer.relativeMapScale) {
             continue;
             }
             }
             */
            pt = this.geometry[i];

            // uncomment to show label track
            // renderMovingLabelTrack(ctx, pt);

            // interpolate position of label along label track
            lon = pt.x;
            lat = pt.y;

            // only draw the point if it is inside the viewport (in geographic coordinates)
            // the point may still be outside the map viewport after projection
            lon = adjlon(lon - lon0);
            if (lat > viewPortBB.north || lat < viewPortBB.south || lon > viewPortBB.east || lon < viewPortBB.west) {
                continue;
            }

            this.projection.forward(lon, lat, xy);
            xy[0] *= this.mapScale;
            xy[1] *= this.mapScale;

            if (alignColumn !== null) {
                align = alignField[i];
                if (align) {
                    // TODO get rid of trim
                    alignLabel(ctx, xy, align.trim(), offsetX, offsetY, fontSize);
                }
            }
            x = xy[0];
            y = xy[1];

            // read text from feature attributes
            label = labelField[i];
           
            // remove empty spaces at end (added by shapefiles)
            // FIXME this should be done once when loading the data
            label = label.trim();

            // FIXME this should be done once when loading the data
            if (toUpperCase) {
                label = label.toUpperCase();
            }

            // split label
            // FIXME this should be done once when loading the data
            labelRows = label.split("#");
            // shift vertically for multi-line labels
            y += lineHeight * (labelRows.length - 1) / 2;

            // vertically distribute labels
            drawLabel(ctx, labelRows, x, y, lineHeight, stroke, fill, fastRender);
        }
    };

    this.render = function(fastRender) {

        if (!this.hasOwnProperty("attributes") || !this.hasOwnProperty("geometry")) {
            return;
        }

        // only draw for valid map scale
        if (!this.isVisible()) {
            return;
        }

        var ctx = this.canvas.getContext('2d');
        this.applyStyle(ctx);
        this.renderPoints(ctx);
        this.renderLabels(ctx, fastRender);
    };

    this.load = function(m) {
        // FIXME use generic data loader
        
        var map = m, layer = this;
        shapefileReader(url, function(geometry, featureType, attributes) {
            layer.geometry = geometry;
            layer.attributes = attributes;
            extractMovingLabelTracks(geometry, attributes);
            map.render();
        });
    };

    /*
     * Extract tracks along which labels move from the attribute table and add the tracks to the point geometry
     */
    function extractMovingLabelTracks(geometry, attributes) {
        // FIXME move variable to beginning
        var i, j;

        var scaleDependentPlacement = style.AM_positions && Array.isArray(style.AM_positions) && style.AM_positions.length > 0;
        if (!scaleDependentPlacement) {
            return;
        }
        var toRad = Math.PI / 180;
        for ( i = 0, nRecords = geometry.length; i < nRecords; i += 1) {
            var shape = geometry[i];
            var track = [], lon, lat;

            // start point is shape geometry
            track.push({
                scale : scaleVisibility ? scaleVisibility.layerMinScale : 0,
                lon : shape.x,
                lat : shape.y
            });

            // following points are in attribute table
            for ( j = 0; j < style.AM_positions.length; j += 1) {
                var pos = style.AM_positions[j];
                lon = getAttributeField(pos.lon)[i];
                lat = getAttributeField(pos.lat)[i];
                if ((!isNaN(lon - 0) && lon != null) && (!isNaN(lat - 0) && lat != null)) {
                    track.push({
                        scale : pos.scale,
                        lon : lon * toRad,
                        lat : lat * toRad
                    });
                }
            }
            if (track.length > 1) {
                shape.labelTrack = track;
            }
        }
    }

    function renderMovingLabelTrack(ctx, shape) {
        
        // FIXME move variable to beginning
        
        var track = shape.labelTrack, i;
        if (!track) {
            return;
        }
        ctx.save();
        ctx.lineWidth = 2 / layer.mapScale;
        ctx.strokeStyle = "orange";
        Layer.setupTransformation(ctx, layer.projection, layer.mapScale, layer.canvas.width, layer.canvas.height);
        var lon0 = layer.mapCenter.lon0;
        var xy = [];
        var lon = track[0].lon;
        lon = adjlon(lon - lon0);
        layer.projection.forward(lon, track[0].lat, xy);
        ctx.beginPath();
        ctx.moveTo(xy[0], xy[1]);
        for ( i = 1; i < track.length; i += 1) {
            var scaleLim = style.AM_positions[i];
            lon = track[i].lon;
            lon = adjlon(lon - lon0);
            layer.projection.forward(lon, track[i].lat, xy);
            ctx.lineTo(xy[0], xy[1]);
        }
        ctx.stroke();
        ctx.restore();
    }

}
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
        spacing = Graticule.getGraticuleSpacing(this.relativeMapScale);
        lineSegment = spacing / Graticule.GRATICULE_DIV;
        ctx.beginPath();
        Graticule.addParallelPathToCanvas(this.projection, this.rotation, ctx, this.LAT, bb.west, bb.east, lineSegment);
        Graticule.addParallelPathToCanvas(this.projection, this.rotation, ctx, -this.LAT, bb.west, bb.east, lineSegment);
        ctx.stroke();
    };
}
function PolylineLayer(url, style, scaleVisibility) {"use strict";

    PolylineLayer.prototype = new AbstractLayer();
    AbstractLayer.call(this, style, scaleVisibility);

    var layer = this;

    this.render = function(fastRender) {

        if (!this.hasOwnProperty("attributes") || !this.hasOwnProperty("geometry")) {
            return;
        }

        // only draw for valid map scale
        if (!this.isVisible()) {
            return;
        }

        var ctx = this.canvas.getContext('2d');
        this.applyStyle(ctx);
        renderPolygons(ctx);
    };

    this.load = function(m) {
        // FIXME use generic data loader

        var map = m, layer = this;
        shapefileReader(url, function(geometry, featureType, attributes) {
            layer.geometry = geometry;
            layer.featureType = featureType;
            layer.attributes = attributes;
            map.render();
        });
    };

    /**
     * Computes two intersection points for a straight line segment that crosses
     * the bounding meridian. Projects and adds the two intersection points and
     * the next end point to a path.
     * @param lonEnd The longitude of the end point of the line segment.
     * @param latEnd The latitude of the end point of the line segment.
     * @param lonStart The longitude of the start point of the line segment.
     * @param latStart The latitude of the start point of the line segment.
     * @param projPath This path will receive three new projected points.
     */

    function projectIntersectingLineTo(lonEnd, latEnd, lonStart, latStart, lon0, lat0, ctx, close, clippedLine) {

        var EPS = 1e-7, dLon, dLat, lon1, lon2, lat1, lat2, xy = [];
        dLat = latEnd - latStart;

        // compute intersection point in geographic coordinates
        // lon1 / lat1 the coordinates of the intermediate end point
        // lon2 / lat2 the coordinates of the intermediate start point

        if (lonStart > Math.PI * 0.500000) {
            // leaving graticule towards east
            dLon = lonEnd - lonStart + 2 * Math.PI;
            lon1 = Math.PI;
            lon2 = -Math.PI;
            if (Math.abs(dLon) < EPS) {
                lat1 = latStart;
                lat2 = latEnd;
            } else {
                lat1 = lat2 = latStart + dLat * (Math.PI - lonStart) / dLon;
            }
        } else if (lonStart < -Math.PI * 0.500000) {
            // leaving graticule towards west
            dLon = lonEnd - lonStart - 2 * Math.PI;
            lon1 = -Math.PI;
            lon2 = Math.PI;
            if (Math.abs(dLon) < EPS) {
                lat1 = latStart;
                lat2 = latEnd;
            } else {
                lat1 = lat2 = latStart + dLat * (-Math.PI - lonStart) / dLon;
            }
        }

        // end the line at the first intermediate point
        layer.projection.forward(lon1, lat1, xy);
        clippedLine.push(lon2);
        clippedLine.push(lat2);
        ctx.lineTo(xy[0], xy[1]);
        /*if (close) {
        // FIXME
        // ctx.closePath();
        }*/

        // start a new line at the second intermediate point
        //layer.projection.forward(lon2, lat2, xy);
        //ctx.moveTo(xy[0], xy[1]);
    }

    function intersectLAT(lonStart, latStart, lonEnd, latEnd) {
        var dLon, dLat, latM, EPS = 1e-7;
        dLat = latEnd - latStart;

        if (lonStart > Math.PI * 0.500000) {
            dLon = lonEnd - lonStart + 2 * Math.PI;
            if (Math.abs(dLon) < EPS) {
                //FIXME
                latM = (latStart + latEnd) / 2;
            } else {
                latM = latStart + dLat * (Math.PI - lonStart) / dLon;
            }
        } else if (lonStart < -Math.PI * 0.500000) {
            dLon = lonEnd - lonStart - 2 * Math.PI;
            if (Math.abs(dLon) < EPS) {
                //FIXME
                latM = (latStart + latEnd) / 2;
            } else {
                latM = latStart + dLat * (-Math.PI - lonStart) / dLon;
            }
        }
        return latM;
    }

    function needsClipping(lonEnd, lonStart) {

        // FIXME
        var K = 0.5, prevRightBorder, nextLeftBorder, prevLeftBorder, nextRightBorder;

        prevRightBorder = lonStart > Math.PI * K;
        nextLeftBorder = lonEnd < -Math.PI * K;
        if (prevRightBorder && nextLeftBorder) {
            return true;
        }
        prevLeftBorder = lonStart < -Math.PI * K;
        nextRightBorder = lonEnd > Math.PI * K;
        if (prevLeftBorder && nextRightBorder) {
            return true;
        }
        return false;
    }

    function goesThroughPole(lonStart, lonEnd) {
        var abs = Math.abs(lonEnd - lonStart);
        if (abs > Math.PI - 1e-5 && abs < Math.PI + 1e-5) {
            return true;
        } else {
            return false;
        }
    }

    function findIntersection(ring, i, lon0, clippedLine, prevLat, latIntersMin, latIntersMax, numbIntersection, step) {
        var pt = [], nCoords, lonStart, latStart, lonEnd, latEnd, polePoint, latM, add, latStep;

        for ( nCoords = ring.length - 2; i < nCoords; i += 2) {
            lonStart = ring[i];
            latStart = ring[i + 1];
            lonEnd = ring[i + 2];
            latEnd = ring[i + 3];

            clippedLine.push(lonStart);
            clippedLine.push(latStart);

            if (needsClipping(lonEnd, lonStart)) {
                latM = intersectLAT(lonStart, latStart, lonEnd, latEnd);
                if (lonStart < 0) {
                    polePoint = -Math.PI;
                    latStep = 1;
                } else {
                    polePoint = Math.PI;
                    latStep = -1;
                }

                if (numbIntersection % 2 === 1 && latStart > 0 && latM === latIntersMax) {
                    //FIXME: Set adding points for different projection (cylindrical, with pole line, with curved pole line)
                    //adding the points along the meridian (form latM to pole point)
                    for ( add = latM; add < Math.PI / 2; add += step) {
                        clippedLine.push(polePoint);
                        clippedLine.push(add);
                    }
                    //adding the points along the pole line
                    for ( add = polePoint; add * latStep < -polePoint * latStep; add += latStep * step) {
                        clippedLine.push(add);
                        clippedLine.push(Math.PI / 2);
                    }
                    //adding the points along the meridian (from pole point back to latM)
                    for ( add = Math.PI / 2; add > latM; add += -step) {
                        clippedLine.push(-polePoint);
                        clippedLine.push(add);
                    }
                    clippedLine.push(-polePoint);
                    clippedLine.push(latM);
                } else if (numbIntersection % 2 === 1 && latStart < 0 && latM === latIntersMin) {
                    //FIXME: Set adding points for different projection (cylindrical, with pole line, with curved pole line)
                    //adding the points along the meridian (form latM to pole point)
                    for ( add = latM; add > -Math.PI / 2; add += -step) {
                        clippedLine.push(polePoint);
                        clippedLine.push(add);
                    }
                    //adding the points along the pole line
                    for ( add = polePoint; add * latStep < -polePoint * latStep; add += latStep * step) {
                        clippedLine.push(add);
                        clippedLine.push(-Math.PI / 2);
                    }
                    //adding the points along the meridian (from pole point back to latM)
                    for ( add = -Math.PI / 2; add < latM; add += step) {
                        clippedLine.push(-polePoint);
                        clippedLine.push(add);
                    }
                    clippedLine.push(-polePoint);
                    clippedLine.push(latM);
                } else {
                    return i;
                }
            }
        }
        return -1;
    }

    function needIntermediatePoint(prevXY, XY) {
        var dY, dX, Dmax;

        dX = (prevXY[0] - XY[0]);
        dY = (prevXY[1] - XY[1]);

        Dmax = (dX * dX + dY * dY) * layer.mapScale * layer.mapScale;

        if (Dmax > 9) {
            //console.log("text");
            return true;
        }
        return false;
    }

    function addRefinementPoints(prevLon, prevLat, lon, lat, prevXY, XY, ctx, count, projectedRingGEO, bBox) {
        // FIXME
        //return;

        var latM, lonM, midXY = [], pt = [], MAX_RECURSION = 30;

        if (count < MAX_RECURSION && needIntermediatePoint(prevXY, XY)) {
            //latM = (prevLat + lat) / 2;
            //lonM = (prevLon + lon) / 2;
            PolylineLayer.intermediateGreatCirclePoint(prevLon, prevLat, lon, lat, 0.5, pt);
            latM = pt[1];
            lonM = pt[0];
            layer.projection.forward(lonM, latM, midXY);
            addRefinementPoints(prevLon, prevLat, lonM, latM, prevXY, midXY, ctx, count += 1, projectedRingGEO, bBox);
            storingPolygonPoints(projectedRingGEO, bBox, lon, lat);
            ctx.lineTo(midXY[0], midXY[1]);
            addRefinementPoints(lonM, latM, lon, lat, midXY, XY, ctx, count += 1, projectedRingGEO, bBox);
        }
    }

    function addMeridianPoints(lonArray, latArray, lonFirst, latFirst, prevLatM, step, clippedLine, ctx) {
        //FIXME: Set adding points for different projection (cylindrical, with pole line, with curved pole line)
        var cutMeridian = Math.PI, newLatM, add, pt = [];
        if (lonArray < 0) {
            cutMeridian = -Math.PI;
        }
        newLatM = intersectLAT(lonArray, latArray, lonFirst, latFirst);
        if (newLatM > prevLatM) {
            for ( add = newLatM; add > prevLatM; add += -step) {
                clippedLine.push(cutMeridian);
                clippedLine.push(add);
            }
            for ( add = prevLatM + step; add < newLatM; add += step) {
                layer.projection.forward(-cutMeridian, add, pt);
                ctx.lineTo(pt[0], pt[1]);
            }
        } else {
            for ( add = newLatM; add < prevLatM; add += step) {
                clippedLine.push(cutMeridian);
                clippedLine.push(add);
            }
            for ( add = prevLatM - step; add > newLatM; add += -step) {
                layer.projection.forward(-cutMeridian, add, pt);
                ctx.lineTo(pt[0], pt[1]);
            }
        }
        layer.projection.forward(-cutMeridian, newLatM, pt);
        ctx.lineTo(pt[0], pt[1]);
        clippedLine.push(cutMeridian);
        clippedLine.push(prevLatM);
    }

    function renderNonIntersectedLines(clippedLines, ctx, projectedRingGEO, bBox) {
        var i, j, line, pt = [], prevXY = [];
        for ( i = 0; i < clippedLines.length; i += 1) {
            line = clippedLines[i];
            layer.projection.forward(line[0], line[1], pt);
            prevXY[0] = pt[0];
            prevXY[1] = pt[1];
            ctx.moveTo(pt[0], pt[1]);
            for ( j = 2; j < line.length; j += 2) {
                layer.projection.forward(line[j], line[j + 1], pt);
                addRefinementPoints(line[j - 2], line[j - 1], line[j], line[j + 1], prevXY, pt, ctx, 0, projectedRingGEO, bBox);
                ctx.lineTo(pt[0], pt[1]);
                prevXY[0] = pt[0];
                prevXY[1] = pt[1];
            }
        }
    }

    function storingPolygonPoints(projectedRingGEO, bBox, lon, lat) {
        if (lon > bBox.xMax) {
            bBox.xMax = lon;
        }
        if (lon < bBox.xMin) {
            bBox.xMin = lon;
        }
        if (lat > bBox.yMax) {
            bBox.yMax = lat;
        }
        if (lat < bBox.yMin) {
            bBox.yMin = lat;
        }
        projectedRingGEO.push(lon);
        projectedRingGEO.push(lat);
    }

    /**
     * Returns 1 if there is an intersections between a closed ring and a ray starting at x / y and 0 otherwise.
     * http://paulbourke.net/geometry/insidepoly/
     */
    function hasRingRayIntersection(ring, x, y) {
        var i, j, nCoords, x1, y1, x2, y2, c;
        c = 0;
        for ( i = 0, nCoords = ring.length, j = ring.length - 2; i < nCoords; j = i, i += 2) {
            x1 = ring[i];
            y1 = ring[i + 1];
            x2 = ring[j];
            y2 = ring[j + 1];
            if ((((y1 <= y) && (y < y2)) || ((y2 <= y) && (y < y1))) && (x < (x2 - x1) * (y - y1) / (y2 - y1) + x1)) {
                c = !c;
            }
        }
        return c;
    }

    /**
     * Returns true if the point at x / y is inside the passed shape. Holes and islands
     * are taken into account.
     */
    function isPointInShape(ring, bBox, lon, lat) {
        var i, j, nCoords, x1, y1, x2, y2, nIntersections = 0;

        if (lon < bBox.xMin || lon > bBox.xMax || lat < bBox.yMin || lat > bBox.yMax) {
            return false;
        }

        for ( i = 0, nCoords = ring.length, j = ring.length - 2; i < nCoords; j = i, i += 2) {
            x1 = ring[i];
            y1 = ring[i + 1];
            x2 = ring[j];
            y2 = ring[j + 1];
            if ((((y1 <= lat) && (lat < y2)) || ((y2 <= lat) && (lat < y1))) && (lon < (x2 - x1) * (lat - y1) / (y2 - y1) + x1)) {
                nIntersections = !nIntersections;
            }
        }
        return nIntersections;

    }

    function renderRing(ctx, ring, close) {

        var rotatedRing = [], pt = [], i, nCoords, lon, lat, lon0, lat0, inc, prevLon, prevLat, lonStart, latStart, clippedLines = [], clippedLine;

        var numbIntersection = 0, latInters = [], latM, latIntersMax = -Math.PI / 2, latIntersMin = Math.PI / 2, trash = [], polePoint, add, sign, latStep, prevXY = [], j;

        var projectedRingGEO = [], bBox = {
            xMin : Math.PI * 2,
            xMax : -Math.PI,
            yMin : Math.PI,
            yMax : -Math.PI
        };

        var step = 2 / 180 * Math.PI;
        //layer.projection.inverse(0, 1 / layer.mapScale, pt);
        //var step = pt[1];

        var azimuthalProj = false, latM2, addAzimuthalCircle = false;
        if (layer.projection.toString().indexOf("Azimuthal") !== -1) {
            azimuthalProj = true;
        }

        lon0 = layer.mapCenter.lon0;
        lat0 = layer.mapCenter.lat0;

        var antipodeLon0 = adjlon(lon0 + Math.PI);
        var antipodeLat0 = -layer.mapCenter.lat0;

        lon = ring[ring.length - 2];
        lat = ring[ring.length - 1];
        lon = adjlon(lon - lon0);
        if (layer.rotation) {
            layer.rotation.transform(lon, lat, pt);
            prevLon = pt[0];
            prevLat = pt[1];
        } else {
            prevLon = lon;
            prevLat = lat;
        }

        // loop over all points to count the number of intersections with the border meridian
        for ( i = 0, nCoords = ring.length; i < nCoords; i += 2) {
            lon = ring[i];
            lat = ring[i + 1];

            // apply rotation
            lon = adjlon(lon - lon0);
            if (layer.rotation) {
                layer.rotation.transform(lon, lat, pt);
                lon = pt[0];
                lat = pt[1];
            }

            // test if the current line segment intersects with the border meridian
            if (close && needsClipping(lon, prevLon)) {
                // increase number of intersections
                numbIntersection += 1;

                // store the minimum and maximum latitude of the intersection
                latM = intersectLAT(prevLon, prevLat, lon, lat);
                if (latM < latIntersMin) {
                    latIntersMin = latM;
                }
                if (latM > latIntersMax) {
                    latIntersMax = latM;
                }
            }

            // special case for line segment that crosses a pole
            if (goesThroughPole(prevLon, lon)) {
                console.log("found line section crossing pole");

                if (prevLat > 0) {
                    if (lat > prevLat - Math.PI / 2) {
                        polePoint = Math.PI / 2;
                    } else {
                        polePoint = -Math.PI / 2;
                    }
                } else {
                    if (lat < prevLat + Math.PI / 2) {
                        polePoint = -Math.PI / 2;
                    } else {
                        polePoint = Math.PI / 2;
                    }
                }
                //FIXME: Set adding points for different projection (cylindrical, with pole line, with curved pole line)
                //adding the points along the meridian (form latM to pole point)
                if (polePoint < 0) {
                    sign = -1;
                } else {
                    sign = 1;
                }
                for ( add = prevLat; add * sign < polePoint * sign; add += sign * step) {
                    rotatedRing.push(prevLon);
                    rotatedRing.push(add);
                }

                if (prevLon < 0) {
                    latStep = -1;
                } else {
                    latStep = 1;
                }
                for ( add = prevLon; add * latStep > lon * latStep; add += -step * latStep) {
                    rotatedRing.push(add);
                    rotatedRing.push(polePoint);
                }

                for ( add = polePoint; add * sign > lat * sign; add += -sign * step) {
                    rotatedRing.push(lon);
                    rotatedRing.push(add);
                }
            }// END special case for line segment that crosses a pole

            // store rotated spherical coordinates
            rotatedRing.push(lon);
            rotatedRing.push(lat);

            prevLon = lon;
            prevLat = lat;
        }

        // transform first point and start drawing a new line
        prevLon = lon = rotatedRing[0];
        prevLat = lat = rotatedRing[1];
        layer.projection.forward(lon, lat, pt);

        // store rotated spherical coordinates of drawn and pojected points in a ring that will
        // also contain additional intermediate points.
        storingPolygonPoints(projectedRingGEO, bBox, lon, lat);
        ctx.moveTo(pt[0], pt[1]);
        prevXY[0] = pt[0];
        prevXY[1] = pt[1];

        // find polar latitude of potential pole box
        // finding minimum to the pole
        if ((Math.PI / 2 - latIntersMax) < (latIntersMin + Math.PI / 2)) {
            latIntersMin = Math.PI / 2;
        } else {
            latIntersMax = -Math.PI / 2;
        }

        // loop over all points for drawing
        for ( i = 2, nCoords = rotatedRing.length; i < nCoords; i += 0) {
            lon = rotatedRing[i];
            lat = rotatedRing[i + 1];

            // test
            if (needsClipping(lon, prevLon)) {
                latM = intersectLAT(prevLon, prevLat, lon, lat);
                polePoint = Math.PI;
                if (prevLon < 0) {
                    polePoint = -Math.PI;
                }
                if (!azimuthalProj && close && numbIntersection % 2 === 1 && prevLat > 0 && latM === latIntersMax) {
                    latStep = -1;
                    if (prevLon < 0) {
                        latStep = 1;
                    }
                    //FIXME: Set adding points for different projection (cylindrical, with pole line, with curved pole line)
                    //adding the points along the meridian (form latM to pole point)
                    for ( add = latM; add < Math.PI / 2; add += step) {
                        layer.projection.forward(polePoint, add, pt);
                        ctx.lineTo(pt[0], pt[1]);
                    }
                    //adding the points along the pole line
                    for ( add = polePoint; add * latStep < -polePoint * latStep; add += latStep * step) {
                        layer.projection.forward(add, Math.PI / 2, pt);
                        ctx.lineTo(pt[0], pt[1]);
                    }
                    //adding the points along the meridian (from pole point back to latM)
                    for ( add = Math.PI / 2; add > latM; add += -step) {
                        layer.projection.forward(-polePoint, add, pt);
                        ctx.lineTo(pt[0], pt[1]);
                    }

                    layer.projection.forward(-polePoint, latM, pt);
                    ctx.lineTo(pt[0], pt[1]);
                    prevLat = latM;
                    prevLon = -polePoint;
                    prevXY[0] = pt[0];
                    prevXY[1] = pt[1];

                } else if (!azimuthalProj && close && numbIntersection % 2 === 1 && prevLat < 0 && latM === latIntersMin) {
                    latStep = -1;
                    if (prevLon < 0) {
                        latStep = 1;
                    }
                    //FIXME: Set adding points for different projection (cylindrical, with pole line, with curved pole line)
                    //adding the points along the meridian (form latM to pole point)
                    for ( add = latM; add > -Math.PI / 2; add += -step) {
                        layer.projection.forward(polePoint, add, pt);
                        ctx.lineTo(pt[0], pt[1]);
                    }
                    //adding the points along the pole line
                    for ( add = polePoint; add * latStep < -polePoint * latStep; add += latStep * step) {
                        layer.projection.forward(add, -Math.PI / 2, pt);
                        ctx.lineTo(pt[0], pt[1]);
                    }
                    //adding the points along the meridian (from pole point back to latM)
                    for ( add = -Math.PI / 2; add < latM; add += step) {
                        layer.projection.forward(-polePoint, add, pt);
                        ctx.lineTo(pt[0], pt[1]);
                    }

                    layer.projection.forward(-polePoint, latM, pt);
                    ctx.lineTo(pt[0], pt[1]);
                    prevLat = latM;
                    prevLon = -polePoint;
                    prevXY[0] = pt[0];
                    prevXY[1] = pt[1];

                } else if (!azimuthalProj && !close) {
                    //adding the last point on the border meridian
                    layer.projection.forward(polePoint, latM, pt);
                    addRefinementPoints(prevLon, prevLat, polePoint, latM, prevXY, pt, ctx, 0, projectedRingGEO, bBox);
                    ctx.lineTo(pt[0], pt[1]);

                    //starting new line segment on the other side of the border meridian
                    layer.projection.forward(-polePoint, latM, pt);
                    ctx.moveTo(pt[0], pt[1]);
                    prevLon = -polePoint;
                    prevLat = latM;
                    prevXY[0] = pt[0];
                    prevXY[1] = pt[1];
                    /*} else if (azimuthalProj && numbIntersection % 2 === 0) {
                     trash = [];
                     j = findIntersection(rotatedRing, i, lon0, trash, prevLat, latIntersMin, latIntersMax, numbIntersection, step);
                     latM2 = intersectLAT(rotatedRing[j], rotatedRing[j + 1], rotatedRing[j + 2], rotatedRing[j + 3]);
                     if ((latM <= 0 && latM2 >= 0) || (latM >= 0 && latM2 <= 0)) {
                     addAzimuthalCircle = true;
                     }*/
                } else if (!azimuthalProj) {
                    clippedLine = [];
                    projectIntersectingLineTo(lon, lat, prevLon, prevLat, lon0, lat0, ctx, close, clippedLine);
                    i = findIntersection(rotatedRing, i, lon0, clippedLine, prevLat, latIntersMin, latIntersMax, numbIntersection, step);
                    if (i < 0) {
                        return;
                    }

                    lonStart = rotatedRing[i];
                    latStart = rotatedRing[i + 1];

                    i += 2;

                    lon = rotatedRing[i];
                    lat = rotatedRing[i + 1];
                    //FIXME: Set adding points for different projection (cylindrical, with pole line, with curved pole line)
                    addMeridianPoints(lonStart, latStart, lon, lat, latM, step, clippedLine, ctx);
                    prevLat = intersectLAT(lonStart, latStart, lon, lat);
                    if (lon < 0) {
                        prevLon = -Math.PI;
                    } else {
                        prevLon = Math.PI;
                    }
                    layer.projection.forward(prevLon, prevLat, prevXY);
                    //projectIntersectingLineTo(lonStart, latStart, lon, lat, lon0, lat0, ctx, close, clippedLine);
                    clippedLines.push(clippedLine);
                }
            }

            layer.projection.forward(lon, lat, pt);
            addRefinementPoints(prevLon, prevLat, lon, lat, prevXY, pt, ctx, 0, projectedRingGEO, bBox);
            storingPolygonPoints(projectedRingGEO, bBox, lon, lat);
            ctx.lineTo(pt[0], pt[1]);
            prevLon = lon;
            prevLat = lat;
            prevXY[0] = pt[0];
            prevXY[1] = pt[1];
            i += 2;
        }

        if (close) {
            ctx.closePath();
            if (azimuthalProj) {
                if (isPointInShape(projectedRingGEO, bBox, antipodeLon0, antipodeLat0)) {
                    addAzimuthalCircle = true;
                } else if (bBox.xMax > Math.PI && antipodeLon0 < 0) {
                    if (isPointInShape(projectedRingGEO, bBox, antipodeLon0 + 2 * Math.PI, antipodeLat0)) {
                        addAzimuthalCircle = true;
                    }
                } else if (bBox.xMin < -Math.PI && antipodeLon0 > 0) {
                    if (isPointInShape(projectedRingGEO, bBox, antipodeLon0 - 2 * Math.PI, antipodeLat0)) {
                        addAzimuthalCircle = true;
                    }
                } else {
                    addAzimuthalCircle = false;
                }
            } else {
                addAzimuthalCircle = false;
            }

            if (addAzimuthalCircle) {
                ctx.fillStyle = "red";
                ctx.moveTo(0, 2);
                for ( i = 1; i < 360; i += 1) {
                    ctx.lineTo(2 * Math.sin(i / 180 * Math.PI), 2 * Math.cos(i / 180 * Math.PI));
                }
                ctx.closePath();
            }
        }

        renderNonIntersectedLines(clippedLines, ctx, projectedRingGEO, bBox);
    }

    function drawShape(shp, ctx, lineWidthScale) {
        var close, j, nRings;
        if (!shp.rings) {
            return;
        }

        close = (layer.featureType === ShpType.SHAPE_POLYGON);

        ctx.beginPath();
        for ( j = 0, nRings = shp.rings.length; j < nRings; j += 1) {
            renderRing(ctx, shp.rings[j], close);
        }

        // FIXME
        if (style.fillStyle) {
            ctx.fill();
        }

        if (style.strokeStyle) {
            if (lineWidthScale > 0) {
                ctx.lineWidth = layer.lineWidth * lineWidthScale / layer.mapScale;
            }
            ctx.stroke();
        }
    }

    // draw the polygons
    function renderPolygons(ctx) {
        var i, lon0, lonLimit, viewPortBB, nRecords, shp, bb, bbWest, bbEast, visible, lineWidthScale, lineWidthScaleField;

        layer.setupTransformation(ctx);

        lon0 = layer.mapCenter.lon0;
        lonLimit = adjlon(lon0 + Math.PI);

        // a bounding box around the viewport in geographic coordinates. This is not a rectangle on the map,
        // but a spherical rectangle sphere, surrounding the map. The east and west coordinates are relative to
        // the central longitude, i.e. the horizontal origin is on lon0
        viewPortBB = layer.visibleGeographicBoundingBoxCenteredOnLon0;

        if (style.hasOwnProperty("AM_lineWidthScaleAtt")) {
            lineWidthScaleField = layer.getAttributeField(style.AM_lineWidthScaleAtt);
        } else {
            lineWidthScaleField = null;
        }

        for ( i = 0, nRecords = layer.geometry.length; i < nRecords; i += 1) {
            /*
             // only draw the feature if the scale is large enough
             if (scaleVisibility && scaleVisibility.featureMinScaleAtt) {
             var featureMinScale = layer.dbfFile.records[i].values[scaleVisibility.featureMinScaleAtt];
             // FIXME
             featureMinScale *= 2;
             if (featureMinScale > layer.relativeMapScale) {
             continue;
             }
             }
             */
            shp = layer.geometry[i];
            bb = shp.box;

            // only project the feature if it is inside the viewport (in geographic coordinates)
            // features may still entirely be outside the map viewport after projection
            // test whether the feature is inside the visible latitude range
            if (bb.yMin > viewPortBB.north || bb.yMax < viewPortBB.south) {
                // FIXME
                //continue;
            }

            // test whether the feature is inside the visible longitude range.
            // to be visible, the feature's west or east border must be inside the viewport,
            // or both borders must be outside the viewport and have oposite signs.
            bbWest = adjlon(bb.xMin - lon0);
            bbEast = adjlon(bb.xMax - lon0);
            visible = ((bbWest > viewPortBB.west && bbWest < viewPortBB.east) || (bbEast > viewPortBB.west && bbEast < viewPortBB.east));
            if (!visible) {
                visible = bbWest <= 0 && bbEast >= 0;
            }

            if (true /* // FIXME visible */) {
                lineWidthScale = 1;
                if (lineWidthScaleField !== null) {
                    // read text from feature attributes
                    lineWidthScale = lineWidthScaleField[i];
                }
                drawShape(shp, ctx, lineWidthScale);
            }
        }
    }

}

PolylineLayer.intermediateGreatCirclePoint = function(lon1, lat1, lon2, lat2, f, pt) {
    var d, A, B, x, y, z, sinDLat, sinDLon, sinD, cosLat1, cosLat2;
    sinDLat = Math.sin(lat1 - lat2);
    sinDLon = Math.sin(lon1 - lon2);
    cosLat1 = Math.cos(lat1);
    cosLat2 = Math.cos(lat2);

    d = 2 * Math.asin(Math.sqrt(sinDLat * sinDLat / 4 + cosLat1 * cosLat2 * sinDLon * sinDLon / 4));
    sinD = Math.sin(d);
    A = Math.sin((1 - f) * d) / sinD;
    B = Math.sin(f * d) / sinD;
    x = A * cosLat1 * Math.cos(lon1) + B * cosLat2 * Math.cos(lon2);
    y = A * cosLat1 * Math.sin(lon1) + B * cosLat2 * Math.sin(lon2);
    z = A * Math.sin(lat1) + B * Math.sin(lat2);
    pt[1] = Math.atan2(z, Math.sqrt(x * x + y * y));
    pt[0] = Math.atan2(y, x);
}; 
/*globals WebGL */

function RasterLayer(url) {"use strict";

    //RasterLayer.prototype = new AbstractLayer();
    //AbstractLayer.call(this, null /*style*/, null /*scaleVisibility*/);

    var gl = null, map, texture, sphereGeometry, shaderProgram;
    
	//Measuring time
	var stats = new Stats();
    //stats.setMode( 2 );
    //document.body.appendChild( stats.domElement );
   
	document.getElementById("FPS").appendChild( stats.domElement );

    this.canvas = null;
    this.projection = null;
    this.mapScale = 1;
    this.mapCenter = {
        lon0 : 0,
        lat0 : 0
    };

    this.render = function() {
        if (!texture.imageLoaded || gl === null) {
            return;
        }
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.uniform1i(gl.getUniformLocation(shaderProgram, "texture"), 0);
        var uniforms = this.projection.getShaderUniforms();
        stats.begin();
        WebGL.draw(gl, this.mapScale / this.refScaleFactor * this.glScale, this.mapCenter.lon0, uniforms, this.canvas, sphereGeometry, shaderProgram);
        stats.end();
		//document.getElementById("FPS").innerHTML = "<b>Rendering speed:</b> " + stats.ms() + " ms, " + stats.fps() + " fps.";
    };

    this.clear = function() {
        if (gl !== null) {
            WebGL.clear(gl);
            gl.deleteTexture(texture);
            gl.deleteProgram(shaderProgram);
            WebGL.deleteGeometry(gl, sphereGeometry);
        }
    };

    function loadData(gl) {
        gl.clearColor(0, 0, 0, 0);
        shaderProgram = WebGL.loadShaderProgram(gl, 'shader/vs/forward.vert', 'shader/fs/forward.frag');
        texture = gl.createTexture();
        sphereGeometry = WebGL.loadGeometry(gl);
        WebGL.loadStaticTexture(gl, url, map, texture);
        WebGL.enableAnisotropicFiltering(gl, texture);
    }


    this.load = function(m) {
        map = m;
        gl = WebGL.init(this.canvas);
        if (gl === null) {
            throw new Error("WebGL is not available. Firefox or Chrome is required.");
        }
        WebGL.addContextLostAndRestoredHandler(this.canvas, loadData);
        loadData(gl);
    };

    this.resize = function(w, h) {
        if (gl !== null) {
            // http://www.khronos.org/registry/webgl/specs/1.0/#2.3
            gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
        }
    };
}
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
/*globals WebGL */
function VideoLayer(videoDOMElement) {"use strict";

    var gl = null, map, shaderProgram, sphereGeometry = [], texture = null, timer;
    this.canvas = null;
    this.projection = null;
    this.mapScale = 1;
    this.mapCenter = {
        lon0 : 0,
        lat0 : 0
    };

    videoDOMElement.addEventListener("ended", function() {
        window.cancelAnimationFrame(timer);
    }, true);

    function updateTexture() {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        // gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, videoDOMElement);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.uniform1i(gl.getUniformLocation(shaderProgram, "texture"), 0);
    }


    this.render = function() {
        var uniforms;

        // render() is calling itself in a rendering loop, and render() is also called when the projection changes.
        // To avoid multiple concurrent rendering loops, the current loop has to be stopped.
        window.cancelAnimationFrame(timer);

        if (gl === null) {
            return;
        }

        if (videoDOMElement.paused) {
            videoDOMElement.play();
        }

        updateTexture();

        uniforms = this.projection.getShaderUniforms();
        WebGL.draw(gl, this.mapScale / this.refScaleFactor * this.glScale, this.mapCenter.lon0, uniforms, this.canvas, sphereGeometry, shaderProgram);

        timer = window.requestAnimationFrame(function() {
            map.render(false);
        });
    };

    this.clear = function() {
        window.cancelAnimationFrame(timer);
        timer = null;
        if (gl !== null) {
            WebGL.clear(gl);
            gl.deleteTexture(texture);
            gl.deleteProgram(shaderProgram);
            WebGL.deleteGeometry(gl, sphereGeometry);
        }
        videoDOMElement.pause();
    };

    this.load = function(m) {
        map = m;
        gl = WebGL.init(this.canvas);
        if (gl === null) {
            throw new Error("WebGL is not available. Firefox or Chrome is required.");
        }
        shaderProgram = WebGL.loadShaderProgram(gl, 'shader/vs/forward.vert', 'shader/fs/forward.frag');
        texture = gl.createTexture();
        sphereGeometry = WebGL.loadGeometry(gl);
        if (videoDOMElement.paused) {
            videoDOMElement.play();
        }
    };

    this.resize = function(w, h) {
        if (gl !== null) {
            // http://www.khronos.org/registry/webgl/specs/1.0/#2.3
            gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
        }
    };
}

/*
 * Binary Ajax 0.2
 * Copyright (c) 2008 Jacob Seidelin, cupboy@gmail.com, http://blog.nihilogic.dk/
 * Licensed under the MPL License [http://www.nihilogic.dk/licenses/mpl-license.txt]
 */


var BinaryFile = function(data, dataOffset, dataLength) {
	var dataOffset = dataOffset || 0;
	var dataLength = 0;

	this.getRawData = function() {
		return data;
	}

	if (typeof data == "string") {
		dataLength = dataLength || data.length;

		this.getByteAt = function(offset) {
			return data.charCodeAt(offset + dataOffset) & 0xFF;
		}
	} else if (typeof data == "unknown") {
		dataLength = dataLength || IEBinary_getLength(data);

		this.getByteAt = function(offset) {
			return IEBinary_getByteAt(data, offset + dataOffset);
		}
	} else {

	}

	this.getLength = function() {
		return dataLength;
	}

	this.getSByteAt = function(offset) {
		var byteVal = this.getByteAt(offset);
		if (byteVal > 127)
			return byteVal - 256;
		else
			return byteVal;
	}

	this.getShortAt = function(offset, bigEndian) {
		var shortVal = bigEndian ? 
			(this.getByteAt(offset) << 8) + this.getByteAt(offset + 1)
			: (this.getByteAt(offset + 1) << 8) + this.getByteAt(offset)
		if (shortVal < 0) shortVal += 65536;
		return shortVal;
	}
	this.getSShortAt = function(offset, bigEndian) {
		var ushort = this.getShortAt(offset, bigEndian);
		if (ushort > 32767)
			return ushort - 65536;
		else
			return ushort;
	}
	this.getLongAt = function(offset, bigEndian) {
		var byte1 = this.getByteAt(offset),
			byte2 = this.getByteAt(offset + 1),
			byte3 = this.getByteAt(offset + 2),
			byte4 = this.getByteAt(offset + 3);

		var longVal = bigEndian ? 
			(((((byte1 << 8) + byte2) << 8) + byte3) << 8) + byte4
			: (((((byte4 << 8) + byte3) << 8) + byte2) << 8) + byte1;
		if (longVal < 0) longVal += 4294967296;
		return longVal;
	}
	this.getSLongAt = function(offset, bigEndian) {
		var ulong = this.getLongAt(offset, bigEndian);
		if (ulong > 2147483647)
			return ulong - 4294967296;
		else
			return ulong;
	}
	this.getStringAt = function(offset, length) {
		var chars = [];
		for (var i=offset,j=0;i<offset+length;i++,j++) {
			chars[j] = String.fromCharCode(this.getByteAt(i));
		}
		return chars.join("");
	}

	this.getCharAt = function(offset) {
		return String.fromCharCode(this.getByteAt(offset));
	}
	this.toBase64 = function() {
		return window.btoa(data);
	}
	this.fromBase64 = function(str) {
		data = window.atob(str);
	}
}


var BinaryAjax = (function() {

	function createRequest() {
		var http = null;
		if (window.XMLHttpRequest) {
			http = new XMLHttpRequest();
		} else if (window.ActiveXObject) {
			http = new ActiveXObject("Microsoft.XMLHTTP");
		}
		return http;
	}

	function getHead(url, callback, error) {
		var http = createRequest();
		if (http) {
			if (callback) {
				if (typeof(http.onload) != "undefined") {
					http.onload = function() {
						if (http.status == "200") {
							callback(this);
						} else {
							if (error) error();
						}
						http = null;
					};
				} else {
					http.onreadystatechange = function() {
						if (http.readyState == 4) {
							if (http.status == "200") {
								callback(this);
							} else {
								if (error) error();
							}
							http = null;
						}
					};
				}
			}
			http.open("HEAD", url, true);
			http.send(null);
		} else {
			if (error) error();
		}
	}

	function sendRequest(url, callback, error, range, acceptRanges, fileSize) {
		var http = createRequest();
		if (http) {

			var dataOffset = 0;
			if (range && !acceptRanges) {
				dataOffset = range[0];
			}
			var dataLen = 0;
			if (range) {
				dataLen = range[1]-range[0]+1;
			}

			if (callback) {
				if (typeof(http.onload) != "undefined") {
					http.onload = function() {
						if (http.status == "200" || http.status == "206" || http.status == "0") {
							http.binaryResponse = new BinaryFile(http.responseText, dataOffset, dataLen);
							http.fileSize = fileSize || http.getResponseHeader("Content-Length");
							callback(http);
						} else {
							if (error) error();
						}
						http = null;
					};
				} else {
					http.onreadystatechange = function() {
						if (http.readyState == 4) {
							if (http.status == "200" || http.status == "206" || http.status == "0") {
								// IE6 craps if we try to extend the XHR object
								var res = {
									status : http.status,
									// IE needs responseBody, Chrome/Safari needs responseText
									binaryResponse : new BinaryFile(http.responseBody || http.responseText, dataOffset, dataLen),
									fileSize : fileSize || http.getResponseHeader("Content-Length")
								};
								callback(res);
							} else {
								if (error) error();
							}
							http = null;
						}
					};
				}
			}
			http.open("GET", url, true);

			if (http.overrideMimeType) http.overrideMimeType('text/plain; charset=x-user-defined');

			if (range && acceptRanges) {
				http.setRequestHeader("Range", "bytes=" + range[0] + "-" + range[1]);
			}

			http.setRequestHeader("If-Modified-Since", "Sat, 1 Jan 1970 00:00:00 GMT");

			http.send(null);
		} else {
			if (error) error();
		}
	}

	return function(url, callback, error, range) {
		if (range) {
			getHead(
				url, 
				function(http) {
					var length = parseInt(http.getResponseHeader("Content-Length"),10);
					var acceptRanges = http.getResponseHeader("Accept-Ranges");

					var start, end;
					start = range[0];
					if (range[0] < 0) 
						start += length;
					end = start + range[1] - 1;

					sendRequest(url, callback, error, [start, end], (acceptRanges == "bytes"), length);
				}
			);
		} else {
			sendRequest(url, callback, error);
		}
	}

}());


document.write(
	"<script type='text/vbscript'>\r\n"
	+ "Function IEBinary_getByteAt(strBinary, offset)\r\n"
	+ "	IEBinary_getByteAt = AscB(MidB(strBinary,offset+1,1))\r\n"
	+ "End Function\r\n"
	+ "Function IEBinary_getLength(strBinary)\r\n"
	+ "	IEBinary_getLength = LenB(strBinary)\r\n"
	+ "End Function\r\n"
	+ "</script>\r\n"
);
/*globals RasterLayer, VideoLayer, resizeCanvasElement */

// FIXME
var MERCATOR_LIMIT_1, MERCATOR_LIMIT_2;
var MERCATOR_LIMIT_WEB_MAP_SCALE = 6;

// distance of standard parallels from upper and lower border of map
var CONIC_STD_PARALLELS_FRACTION = 1 / 6;

// an height-to-width ratio between formatRatioLimit and 1/formatRatioLimit
// is considered to be square.
var formatRatioLimit = 0.8;

function mouseToCanvasCoordinates(e, parent) {
    // FIXME there should be a better way for this
    var node, x = e.clientX, y = e.clientY;

    // correct for scrolled document
    x += document.body.scrollLeft + document.documentElement.scrollLeft;
    y += document.body.scrollTop + document.documentElement.scrollTop;

    // correct for nested offsets in DOM
    for ( node = parent; node; node = node.offsetParent) {
        x -= node.offsetLeft;
        y -= node.offsetTop;
    }
    return {
        x : x,
        y : y
    };
}

function AdaptiveMap(parent, canvasWidth, canvasHeight, mapLayers, projectionChangeListener) {"use strict";

    // scale if map is not zoomed
    var CONSTANT_SCALE = 0.5;

    // scale limits where projections change
    var DEF_SCALE_LIMIT_1 = 1.5;
    var DEF_SCALE_LIMIT_2 = 2;
    var DEF_SCALE_LIMIT_3 = 3;
    var DEF_SCALE_LIMIT_4 = 4;
    var DEF_SCALE_LIMIT_5 = 6;

    var MERCATOR_TRANSITION_WIDTH = 0.75;

    // FIXME should not be global
    map = this;
    var layers = mapLayers;

    // if true, the center of the map and the position of standard parallels are drawn
    var drawOverlayCanvas = false;

    // FIXME scale limits should be stored in an array
    var scaleLimit1 = DEF_SCALE_LIMIT_1;
    var scaleLimit2 = DEF_SCALE_LIMIT_2;
    var scaleLimit3 = DEF_SCALE_LIMIT_3;
    var scaleLimit4 = DEF_SCALE_LIMIT_4;
    var scaleLimit5 = DEF_SCALE_LIMIT_5;

    // FIXME scale limits should be stored in an array
    this.getScaleLimits = function(factor) {
        if ( typeof factor !== "number") {
            factor = 1;
        }
        return [scaleLimit1 * factor, scaleLimit2 * factor, scaleLimit3 * factor, scaleLimit4 * factor, scaleLimit5 * factor];
    };

    // FIXME scale limits should be stored in an array
    this.setScaleLimits = function(limits, factor) {
        scaleLimit1 = limits[0] / factor;
        scaleLimit2 = limits[1] / factor;
        scaleLimit3 = limits[2] / factor;
        scaleLimit4 = limits[3] / factor;
        scaleLimit5 = limits[4] / factor;
    };

    // Latitude limit between clyindrical and conic projection at large scales
    // Use cylindrical projection between the equator and cylindricalLowerLat
    var cylindricalLowerLat = 15 * Math.PI / 180;
    // use transition between cylindricalUpperLat and cylindricalLowerLat
    var cylindricalUpperLat = 22 * Math.PI / 180;

    // use azimuthal projection if central latitude is larger (for large scales)
    var polarUpperLat = 75 * Math.PI / 180;
    // use transition between polarLowerLat and polarUpperLat
    var polarLowerLat = 60 * Math.PI / 180;

    /**
     * Use the Mercator projection if scale is larger than the value returned.
     * FIXME: MERCATOR_LIMIT_1 and MERCATOR_LIMIT_2 are not valid when
     * the small scale projection changes, as they are relative to the small-scale graticule height !?
     */

    // size of web mercator in pixels at web map scale where the transition to
    // the web mercator projection occurs
    var mercatorMapSize = Math.pow(2, 8 + MERCATOR_LIMIT_WEB_MAP_SCALE);

    // height of the adaptive map in coordinates projected with the unary sphere
    var smallScaleProjection = ProjectionFactory.getSmallScaleProjection(smallScaleMapProjectionName);
    var graticuleHeight = 2 * ProjectionFactory.halfCentralMeridianLengthOfSmallScaleProjection(smallScaleProjection);

    // scale factor to fill the canvas with the projected map
    var r = canvasHeight / graticuleHeight;

    // scale factor where the web mercator is used
    MERCATOR_LIMIT_2 = mercatorMapSize / (Math.PI * 2 * r);

    /**
     * scale factor where the transition towards the web mercator starts
     */
    MERCATOR_LIMIT_1 = MERCATOR_LIMIT_2 - MERCATOR_TRANSITION_WIDTH;

    // longitude and latitude of the map center in radians
    var mapCenter = {
        lon0 : 62.586903678158244 / 180 * Math.PI,
        lat0 : 16.40137942693096 / 180 * Math.PI
    };

    // maximum zoom factor
    var MAX_SCALE = 100;

    // minimum zoom factor
    var MIN_SCALE = 0.1;

    // zoom level relativ to canvas size. 1: entire map.
    var mapScale = 0.95;

    var smallScaleMapProjectionName = "Hammer";
    var rotateSmallScales = true;
    var zoomToMap = true;

    var snapEquator = true;

    function projectionChanged() {
        map.updateProjection();
        projectionChangeListener(map);
        map.render();
    }


    this.getCentralLatitude = function() {
        return mapCenter.lat0;
    };

    this.getCentralLongitude = function() {
        return mapCenter.lon0;
    };

    this.setCentralLongitude = function(lon0) {
        // FIXME test for valid values
        mapCenter.lon0 = lon0;
        projectionChangeListener(map);
        this.render();
    };

    this.setCentralLatitudeAndScale = function(lat0, scale) {
        mapCenter.lat0 = Math.max(Math.min(lat0, Math.PI / 2), -Math.PI / 2);
        mapScale = scale = Math.max(Math.min(scale, MAX_SCALE), MIN_SCALE);
        projectionChangeListener(map);
        this.render();
    };

    this.setCenter = function(lon0, lat0) {
        mapCenter.lon0 = adjlon(lon0);
        mapCenter.lat0 = Math.max(Math.min(lat0, Math.PI / 2), -Math.PI / 2);
        projectionChangeListener(map);
        this.render();
    };

    this.getMapScale = function() {
        return mapScale;
    };

    this.setMapScale = function(s) {
        mapScale = Math.max(MIN_SCALE, Math.min(s, MAX_SCALE));
        projectionChangeListener(map);
        this.render();
    };

    this.isUsingWorldMapProjection = function() {
        return mapScale < scaleLimit1;
    };

     // Compute scale factor such that the graticule fits vertically onto the canvas.
    // This defines mapScale = 1
    function referenceScaleFactor() {
        var smallScaleProjection, graticuleHeight;
        smallScaleProjection = ProjectionFactory.getSmallScaleProjection(smallScaleMapProjectionName);
        graticuleHeight = 2 * ProjectionFactory.halfCentralMeridianLengthOfSmallScaleProjection(smallScaleProjection);
        return canvasHeight / graticuleHeight;
    }
    
    // invert the offset and scaling applied when rendering the map layers
    this.canvasXYToUnscaledXY = function(x, y) {
        var cx, cy, scale;
        cx = canvasWidth / 2;
        cy = canvasHeight / 2;
        x -= cx;
        y = cy - y;
        scale = referenceScaleFactor() * mapScale;
        return [x / scale, y / scale];
    };

    // converts from canvas coordinates to geographic longitude and latitude.
    // the resulting geographic coordinates can be outsde of +/-PI
    this.canvasXY2LonLat = function(x, y, projection) {
        // invert the offset and scaling applied when rendering the map layers
        var pt = this.canvasXYToUnscaledXY(x, y);
        // convert to longitude / latitude
        if (!projection) {
            projection = this.updateProjection();
        }
        projection.inverse(pt[0], pt[1], pt);
        pt[0] += mapCenter.lon0;
        return pt;
    };

    // FIXME seems to be broken: apply lon0?
    this.lonLat2Canvas = function(lon, lat, proj) {
        var dy, scale, centerX, centerY, pt = [];

        if (!proj) {
            proj = map.updateProjection();
        }
        proj.forward(lon, lat, pt);

        // x = canvas.width / 2 + x * mapScale
        // y = canvas.height / 2 - dy - y * mapScale
        scale = referenceScaleFactor() * mapScale;

        dy = ( typeof proj.getFalseNorthing === 'function') ? proj.getFalseNorthing() : 0;
        centerX = canvasWidth / 2;
        centerY = canvasHeight / 2;
        pt[0] = centerX + pt[0] * scale;
        pt[1] = centerY - (pt[1] + dy) * scale;
        return pt;
    };

    this.updateProjection = function() {

        // The graticule of the transformed Lambert azimuthal projection has an invard pointing wedge
        // when w is between 0.5 and 1. To make sure this wedge is not visible, the scale limit is adjusted
        // where the transformed Lambert azimuthal projection is used.
        var scaleLimit = scaleLimit1;
        var isLandscape = (canvasHeight / canvasWidth) < formatRatioLimit;
        // FIXME add blending of scaleLimit for smooth transition after the aspect ratio of the
        // map changed (e.g. when resizing the window)
        if (!isLandscape) {
            var mapTop = this.canvasXYToUnscaledXY(canvasWidth / 2, 0)[1] * mapScale;
            var xy = [];
            TransformedLambertAzimuthal.Hammer().forward(0, Math.PI / 2, xy);
            scaleLimit = mapTop / xy[1];
        }

        this.conf = {
            mapScale : mapScale,
            lon0 : mapCenter.lon0,
            lat0 : mapCenter.lat0,
            lat1 : NaN,
            lat2 : NaN,
            scaleLimit1 : scaleLimit,
            // FIXME scaleLimit2 - scaleLimit1
            scaleLimit2 : scaleLimit + (scaleLimit2 - scaleLimit1),
            scaleLimit3 : scaleLimit3,
            scaleLimit4 : scaleLimit4,
            scaleLimit5 : scaleLimit5,
            mercatorLimit1 : MERCATOR_LIMIT_1,
            mercatorLimit2 : MERCATOR_LIMIT_2,
            centerXY : this.canvasXYToUnscaledXY(canvasWidth / 2, canvasHeight / 2),
            topPt : this.canvasXYToUnscaledXY(canvasWidth / 2, 0),
            bottomPt : this.canvasXYToUnscaledXY(canvasWidth / 2, canvasHeight),
            polarUpperLat : polarUpperLat,
            polarUpperLatDefault : polarUpperLat,
            polarLowerLat : polarLowerLat,
            mapDimension : this.canvasXYToUnscaledXY(canvasWidth, 0),
            cylindricalUpperLat : cylindricalUpperLat,
            cylindricalLowerLat : cylindricalLowerLat,
            canvasHeight : canvasHeight,
            canvasWidth : canvasWidth,
            smallScaleProjectionName : smallScaleMapProjectionName,
            referenceScaleFactor : referenceScaleFactor(),
            formatRatioLimit : formatRatioLimit,
            rotateSmallScale : rotateSmallScales
        };
        // adjust the latitude at which the azimuthal projection is used for polar areas,
        // to make sure the wedge of the Albers conic projection is not visible on the map.
        this.conf.polarUpperLat = ProjectionFactory.polarLatitudeLimitForAlbersConic(this.conf.topPt[1], mapScale, polarLowerLat, polarUpperLat);

        return ProjectionFactory.create(this.conf);
    };

    function extendRect(r, lon, lat) {
        if (lon < r.west) {
            r.west = lon;
        }
        if (lat < r.south) {
            r.south = lat;
        }
        if (lon > r.east) {
            r.east = lon;
        }
        if (lat > r.north) {
            r.north = lat;
        }
    }

    function isNorthPoleVisible(projection) {
        var poleXYCanvas = map.lonLat2Canvas(0, Math.PI / 2, projection);
        return (poleXYCanvas[0] >= 0 && poleXYCanvas[0] <= canvasWidth && poleXYCanvas[1] >= 0 && poleXYCanvas[1] <= canvasHeight);
    }

    function isSouthPoleVisible(projection) {
        var poleXYCanvas = map.lonLat2Canvas(0, -Math.PI / 2, projection);
        return (poleXYCanvas[0] >= 0 && poleXYCanvas[0] <= canvasWidth && poleXYCanvas[1] >= 0 && poleXYCanvas[1] <= canvasHeight);
    }

    function visibleGeographicBoundingBoxCenteredOnLon0(projection) {
        // FIXME
        var INC = 10,

        // bounding box
        bb = {
            west : Number.MAX_VALUE,
            south : Number.MAX_VALUE,
            east : -Number.MAX_VALUE,
            north : -Number.MAX_VALUE
        }, x, y, lonlat;

        // if a pole is visible, the complete longitude range is visible on the map
        if (isNorthPoleVisible(projection) || isSouthPoleVisible(projection)) {
            bb.west = -Math.PI + mapCenter.lon0;
            bb.east = Math.PI + mapCenter.lon0;
        }

        if (isSouthPoleVisible(projection)) {
            bb.south = -Math.PI / 2;
        }
        if (isNorthPoleVisible(projection)) {
            bb.north = Math.PI / 2;
        }

        // top and bottom border
        for ( x = 0; x < canvasWidth; x += INC) {
            lonlat = map.canvasXY2LonLat(x, 0, projection);
            extendRect(bb, lonlat[0], lonlat[1]);
            lonlat = map.canvasXY2LonLat(x, canvasHeight, projection);
            extendRect(bb, lonlat[0], lonlat[1]);
        }

        // left and right border
        for ( y = 0; y < canvasHeight; y += INC) {
            lonlat = map.canvasXY2LonLat(0, y, projection);
            extendRect(bb, lonlat[0], lonlat[1]);
            lonlat = map.canvasXY2LonLat(canvasWidth, y, projection);
            extendRect(bb, lonlat[0], lonlat[1]);
        }

        // center on central longitude
        bb.west -= mapCenter.lon0;
        bb.east -= mapCenter.lon0;

        // clamp to valid range
        if (bb.west < -Math.PI) {
            bb.west = -Math.PI;
        }
        if (bb.east > Math.PI) {
            bb.east = Math.PI;
        }
        if (bb.south < -Math.PI / 2) {
            bb.south = -Math.PI / 2;
        }
        if (bb.north > Math.PI / 2) {
            bb.north = Math.PI / 2;
        }

        return bb;
    }


    this.render = function(fastRender) {
        if (!layers) {
            return;
        }

        var projection = this.updateProjection();
        var bb = visibleGeographicBoundingBoxCenteredOnLon0(projection);

        var ctx = backgroundCanvas.getContext('2d');
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, backgroundCanvas.width, backgroundCanvas.height);

        var refScaleFactor = referenceScaleFactor();
        var scale = refScaleFactor * ( zoomToMap ? mapScale : CONSTANT_SCALE);

        var vectorContext = vectorCanvas.getContext('2d');
        vectorContext.setTransform(1, 0, 0, 1, 0, 0);
        vectorContext.clearRect(0, 0, vectorCanvas.width, vectorCanvas.height);

        // FIXME
        var layerID, layer;

        for ( layerID = 0; layerID < layers.length; layerID += 1) {
            //save context so that each layer can change drawing states
            vectorContext.save();

            layer = layers[layerID];
            layer.visibleGeographicBoundingBoxCenteredOnLon0 = bb;
            layer.projection = projection;

            layer.rotation = null;
            if ( typeof projection.getPoleLatitude === 'function') {
                var poleLat = projection.getPoleLatitude();
                if (poleLat !== Math.PI / 2) {
                    layer.rotation = new SphericalRotation(poleLat);
                }
            }

            layer.mapScale = scale;
            layer.relativeMapScale = mapScale;
            layer.refScaleFactor = referenceScaleFactor();
            layer.glScale = 2 * refScaleFactor / canvasHeight;
            layer.mapCenter = mapCenter;
            layer.northPoleVisible = isNorthPoleVisible(projection);
            layer.southPoleVisible = isSouthPoleVisible(projection);
            layer.map = this;
            layer.canvasWidth = canvasWidth;
            layer.canvasHeight = canvasHeight;
            layer.render(fastRender, zoomToMap);

            // restore drawing states
            vectorContext.restore();
        }

        // render overlay canvas
        var ctx = overlayCanvas.getContext('2d');
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
        var cx = overlayCanvas.width / 2;
        var cy = overlayCanvas.height / 2;
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#000000';
        ctx.fillStyle = '#000000';
        ctx.shadowColor = "gray";
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;
        ctx.shadowBlur = 3;

        // mark the center of the map
        if (drawOverlayCanvas) {
            var l = 10;
            ctx.beginPath();
            ctx.moveTo(cx - l, cy);
            ctx.lineTo(cx + l, cy);
            ctx.moveTo(cx, cy - l);
            ctx.lineTo(cx, cy + l);
            ctx.stroke();
        }

        // mark standard parallels
        if (drawOverlayCanvas && !isNaN(this.conf.lat1) && !isNaN(this.conf.lat2)) {
            var pt = [];
            ctx.beginPath();
            projection.forward(0, this.conf.lat1, pt);
            ctx.moveTo(cx - l, cy - pt[1] * scale);
            ctx.lineTo(cx + l, cy - pt[1] * scale);
            projection.forward(0, this.conf.lat2, pt);
            ctx.moveTo(cx - l, cy - pt[1] * scale);
            ctx.lineTo(cx + l, cy - pt[1] * scale);
            ctx.stroke();

            // a frame around the canvas. Half of the line will be outside the canvas, so
            // use double line width.
            ctx.shadowColor = null;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
            ctx.shadowBlur = 0;
            ctx.lineWidth = 2;
            ctx.strokeRect(0, 0, overlayCanvas.width, overlayCanvas.height);
        }
        // Draw the extension of the map if zooming is disabled.
        // With zooming enabled, this would overpaint the frame drawn above.
        // FIXME
        if (!zoomToMap) {
            ctx.shadowOffsetX = 1;
            ctx.shadowOffsetY = 1;
            ctx.shadowBlur = 1;
            var topLeft = this.canvasXYToUnscaledXY(0, 0);
            var w = topLeft[0] * scale * 2;
            var h = topLeft[1] * scale * 2;
            ctx.globalAlpha = 0.1;
            ctx.fillRect(cx + topLeft[0] * scale, cy - topLeft[1] * scale, -w, h);
            ctx.globalAlpha = 1;
            ctx.shadowBlur = 0;
            ctx.lineWidth = 5;
            ctx.strokeStyle = 'white';
            ctx.strokeRect(cx + topLeft[0] * scale, cy - topLeft[1] * scale, -w, h);
            ctx.lineWidth = 1;
            ctx.strokeStyle = 'black';
            ctx.strokeRect(cx + topLeft[0] * scale, cy - topLeft[1] * scale, -w, h);
        }

        // write size of the window
        if (drawOverlayCanvas) {
            var typeSize = 13;
            var txt = canvasWidth + "\u2005\u00D7\u2005" + canvasHeight;
            ctx.font = "normal normal " + typeSize + "px sans-serif";
            var metrics = ctx.measureText(txt);
            ctx.fillText(txt, canvasWidth - metrics.width - typeSize, canvasHeight - typeSize * 0.5);
        }
    };

    this.resizeMap = function(w, h) {
        var layerID;

        // FIXME remove canvasWidth and canvasHeight?
        canvasWidth = w;
        canvasHeight = h;

        resizeCanvasElement(backgroundCanvas, w, h);
        resizeCanvasElement(rasterCanvas, w, h);
        resizeCanvasElement(vectorCanvas, w, h);
        resizeCanvasElement(overlayCanvas, w, h);

        if (layers) {
            for ( layerID = 0; layerID < layers.length; layerID += 1) {
                if (layers[layerID].resize) {
                    layers[layerID].resize(w, h);
                }
            }
        }

        // apply size to parent for proper layout
        parent.style.width = w;
        parent.style.height = h;
    };

    // zoom in or out after mouse has been scrolled
    // FIXME x and y are not used
    this.zoomBy = function(s, x, y) {
        mapScale /= s;

        if (mapScale > MAX_SCALE) {
            mapScale = MAX_SCALE;
        } else if (mapScale < MIN_SCALE) {
            mapScale = MIN_SCALE;
        }

        map.render();
        projectionChangeListener(map);
    };

    function clampMapCenter() {
        mapCenter.lon0 = adjlon(mapCenter.lon0);
        var maxLat = Math.PI / 2;
        if (mapCenter.lat0 > maxLat) {
            mapCenter.lat0 = maxLat;
        } else if (mapCenter.lat0 < -maxLat) {
            mapCenter.lat0 = -maxLat;
        }
    }

    function loadMapData() {
        var layer, nLayers, i;

        //  load map layer data
        if (layers) {
            for ( i = 0, nLayers = layers.length; i < nLayers; i += 1) {
                layer = layers[i];
                if ( layer instanceof RasterLayer || layer instanceof VideoLayer) {
                    layer.canvas = rasterCanvas;
                } else {
                    layer.canvas = vectorCanvas;
                }
                layer.projection = projection;
                layer.mapScale = referenceScaleFactor() * mapScale;
                layer.mapCenter = mapCenter;
                try {
                    layer.load(map);
                } catch (e) {
                    console.log(e.name, e.message);
                }
            }
        }
    }

    var projection = this.updateProjection();

    // create a background canvas
    var backgroundCanvas = createCanvas('backgroundCanvas', parent, canvasWidth, canvasHeight);
    backgroundCanvas.style.zIndex = 1;

    // create the map canvases
    var rasterCanvas = createCanvas('rasterCanvas', parent, canvasWidth, canvasHeight);
    rasterCanvas.style.zIndex = 2;
    var vectorCanvas = createCanvas('vectorCanvas', parent, canvasWidth, canvasHeight);
    vectorCanvas.style.zIndex = 3;

    loadMapData();

    // create an overlay canvas
    var overlayCanvas = createCanvas('overlayCanvas', parent, canvasWidth, canvasHeight);
    overlayCanvas.style.zIndex = 4;

    this.resizeMap(canvasWidth, canvasHeight);

    map.render();
    projectionChangeListener(map);

    /**
     * Replace all layers of this map with a new set of layers.
     * Calls clear() of all previous layers.
     */
    this.setLayers = function(mapLayers) {
        var i, layer;
        if (layers) {
            for ( i = 0; i < layers.length; i += 1) {
                layer = layers[i];
                if ( typeof (layer.clear) === 'function') {
                    layer.clear();
                }
            }
        }
        layers = mapLayers;
        loadMapData();
    };

    this.getLargeScalePolarUpperLat = function() {
        return polarUpperLat;
    };

    this.setLargeScalePolarUpperLat = function(lat) {
        polarUpperLat = lat;
        this.render();
    };

    this.getLargeScalePolarLowerLat = function() {
        return polarLowerLat;
    };

    this.setLargeScalePolarLowerLat = function(lat) {
        polarLowerLat = lat;
        this.render();
    };

    this.getLargeScaleCylindricalLowerLat = function() {
        return cylindricalLowerLat;
    };

    this.setLargeScaleCylindricalLowerLat = function(lat) {
        cylindricalLowerLat = lat;
        this.render();
    };

    this.getLargeScaleCylindricalUpperLat = function() {
        return cylindricalUpperLat;
    };

    this.setLargeScaleCylindricalUpperLat = function(lat) {
        cylindricalUpperLat = lat;
        this.render();
    };

    this.setSmallScaleMapProjectionName = function(name) {
        smallScaleMapProjectionName = name;
        projectionChanged();
    };

    this.getSmallScaleMapProjectionName = function() {
        return smallScaleMapProjectionName;
    };

    this.setRotateSmallScales = function(rotate) {
        rotateSmallScales = rotate;
        projectionChanged();
    };

    this.isRotateSmallScale = function() {
        return rotateSmallScales;
    };

    this.isZoomToMap = function() {
        return zoomToMap;
    };

    this.setZoomToMap = function(zoom) {
        zoomToMap = zoom;
        projectionChanged();
    };

    this.isDrawingOverlay = function() {
        return drawOverlayCanvas;
    };

    this.setDrawOverlay = function(draw) {
        drawOverlayCanvas = draw;
    };

    this.isEquatorSnapping = function() {
        return snapEquator;
    };

    this.setEquatorSnapping = function(snap) {
        snapEquator = snap;
        this.render();
    };

    this.getCanvasWidth = function() {
        return canvasWidth;
    };

    this.getCanvasHeight = function() {
        return canvasHeight;
    };

    this.getWebGLCanvas = function() {
        return rasterCanvas;
    };

    this.getParent = function() {
        return parent;
    };
}
/*globals formatLatitude*/

function AlbersConicEqualArea() {"use strict";
	
    var c, rho0, n, n2;
    var HALFPI = Math.PI / 2;
    var EPS10 = 1.0e-10;
                   
    this.toString = function() {
        return 'Albers Conic Equal Area (&Phi;\u2081=' + formatLatitude(this.lat1) + ' &Phi;\u2082=' + formatLatitude(this.lat2) + ')';
    };

    this.isEqualArea = function() {
        return true;
    };

    this.initialize = function(conf) {

        // FIXME
        this.lat1 = conf.lat1;
        this.lat2 = conf.lat2;

        var phi0 = conf.lat0, phi1 = conf.lat1, phi2 = conf.lat2;
        /*
         FIXME
         if(phi0 > HALFPI) {
         phi0 = HALFPI;
         }
         if(phi0 < -HALFPI) {
         phi0 = -HALFPI;
         }
         if(phi1 > HALFPI) {
         phi1 = HALFPI;
         }
         if(phi1 < -HALFPI) {
         phi1 = -HALFPI;
         }
         if(phi2 > HALFPI) {
         phi2 = HALFPI;
         }
         if(phi2 < -HALFPI) {
         phi2 = -HALFPI;
         }
         */
        if (Math.abs(phi1 + phi2) < EPS10) {
            n = NaN;
            throw new Error("Standard latitudes of Albers conic too close to equator");
        }

        var cosPhi1 = Math.cos(phi1), sinPhi1 = Math.sin(phi1);
        var secant = Math.abs(phi1 - phi2) >= EPS10;
        if (secant) {
            n = 0.5 * (sinPhi1 + Math.sin(phi2));
        } else {
            n = sinPhi1;
        }
        n2 = 2 * n;
        c = cosPhi1 * cosPhi1 + n2 * sinPhi1;
        rho0 = Math.sqrt(c - n2 * Math.sin(phi0)) / n;

    };

    this.forward = function(lon, lat, xy) {
        var rho, n_x_lon;
        rho = c - n2 * Math.sin(lat);
        if (rho < 0) {
            xy[0] = NaN;
            xy[1] = NaN;
        }
        rho = Math.sqrt(rho) / n;
        n_x_lon = n * lon;
        xy[0] = rho * Math.sin(n_x_lon);
        xy[1] = rho0 - rho * Math.cos(n_x_lon);
    };

    this.inverse = function(x, y, lonlat) {
        var rho, phi;
        y = rho0 - y;
        rho = Math.sqrt(x * x + y * y);
        if (rho === 0) {
            lonlat[0] = 0;
            lonlat[1] = n > 0 ? HALFPI : -HALFPI;
        } else {
            phi = rho * n;
            phi = (c - phi * phi) / n2;
            if (Math.abs(phi) <= 1) {
                lonlat[1] = Math.asin(phi);
            } else {
                lonlat[1] = phi < 0 ? -HALFPI : HALFPI;
            }

            if (n < 0) {
                lonlat[0] = Math.atan2(-x, -y) / n;
            } else {
                lonlat[0] = Math.atan2(x, y) / n;
            }
        }

    };

    this.getOutline = function() {
        return GraticuleOutline.conicOutline(this);
    };

    this.getShaderUniforms = function() {
        return {
            "projectionID" : this.getID(),
            "c" : c,
            "rho0" : rho0,
            "n" : n
        };
    };

    this.getID = function() {
        return 11;
    };
}
function AlbersConicEqualAreaOblique(dy) {"use strict";
	
	var c, rho0, n, n2;
	var HALFPI = Math.PI / 2;
	var EPS10 = 1.0e-10;
	var lat0, lat1, lat2;

	// position of pole
	var sinLatPole = 1;
	var cosLatPole = 0;
	var poleLat = HALFPI;

	this.toString = function() {
		return 'Albers Conic Equal Area Oblique (&Phi;\u2081=' + formatLatitude(this.lat1) + ' &Phi;\u2082=' + formatLatitude(this.lat2) + ', pole at ' + formatLatitude(poleLat) + ")";
	};

	this.isEqualArea = function() {
		return true;
	};

	this.getPoleLat = function() {
		return poleLat;
	};

	this.initialize = function(conf) {

		this.lat0 = conf.lat0;
		this.lat1 = conf.lat1;
		this.lat2 = conf.lat2;

		var lat0 = conf.lat0;
		var lat1 = conf.lat1;
		var lat2 = conf.lat2;
		
		if (Math.abs(lat1 + lat2) < EPS10) {
			// FIXME
			console.log("standard latitudes of Albers conic too close to equator");
			n = NaN;
			return;
		}
		var cosPhi1 = Math.cos(lat1);
		var sinPhi1 = Math.sin(lat1);
		var secant = Math.abs(lat1 - lat2) >= EPS10;
		if (secant) {
			n = 0.5 * (sinPhi1 + Math.sin(lat2));
		} else {
			n = sinPhi1;
		}
		n2 = 2 * n;
		c = cosPhi1 * cosPhi1 + n2 * sinPhi1;
		rho0 = Math.sqrt(c - n2 * Math.sin(lat0)) / n;
		poleLat = conf.poleLat;
		sinLatPole = Math.sin(poleLat);
		cosLatPole = Math.cos(poleLat);
	};

	this.forward = function(lon, lat, xy) {

		// oblique transformation on sphere
		var sinLon = Math.sin(lon);
		var cosLon = Math.cos(lon);
		var sinLat = Math.sin(lat);
		var cosLat = Math.cos(lat);
		var cosLat_x_cosLon = cosLat * cosLon;
		lon = adjlon(aatan2(cosLat * sinLon, sinLatPole * cosLat_x_cosLon + cosLatPole * sinLat));
		sinLat = sinLatPole * sinLat - cosLatPole * cosLat_x_cosLon;

		// make sure sinLat is in valid range of +/-1
		if (sinLat > 1) {
			sinLat = 1;
		} else if (sinLat < -1) {
			sinLat = -1;
		}

		// projection with normal aspect applied to rotated coordinates
		var rho = c - n2 * sinLat;
		if (rho < 0) {
			xy[0] = NaN;
			xy[1] = NaN;
			console.log("Albers Conic NaN2: " + rho + " " + absSinLat + " " + lon / Math.PI * 180 + " " + lat / Math.PI * 180);
			// FIXME
			return;
		}
		rho = Math.sqrt(rho) / n;
		var n_x_lon = n * lon;
		xy[0] = rho * Math.sin(n_x_lon);
		xy[1] = rho0 - rho * Math.cos(n_x_lon);
	};

	this.inverse = function(x, y, lonlat) {

		var rho, phi, lon;
		var sinLon, cosLon, sinLat, cosLat;
		y -= dy;
		y = rho0 - y;
		rho = Math.sqrt(x * x + y * y);
		if (rho === 0) {
			// lon = 0
			sinLon = 0;
			cosLon = 1;
			// lat = +/- PI/2
			cosLat = 0;
			sinLat = n > 0 ? 1 : -1;
		} else {
			phi = rho * n;
			phi = (c - phi * phi) / n2;
			if (Math.abs(phi) <= 1) {
				cosLat = Math.sqrt(1 - phi * phi);
				sinLat = phi;
			} else {
				// lat = +/- PI/2
				cosLat = 0;
				sinLat = phi < 0 ? -1 : 1;
			}
			if (n < 0) {
				lon = Math.atan2(-x, -y) / n;
			} else {
				lon = Math.atan2(x, y) / n;
			}
			sinLon = Math.sin(lon);
			cosLon = Math.cos(lon);
		}

		// oblique transformation on sphere
		var cosLat_x_cosLon = cosLat * cosLon;
		lonlat[0] = aatan2(cosLat * sinLon, sinLatPole * cosLat_x_cosLon - cosLatPole * sinLat);
		lonlat[1] = aasin(sinLatPole * sinLat + cosLatPole * cosLat_x_cosLon);
	};

	this.getOutline = function() {
		var albers = new AlbersConicEqualArea();
		albers.initialize({
			lat0 : this.lat0,
			lat1 : this.lat1,
			lat2 : this.lat2
		});
		return albers.getOutline();
	};

	this.getShaderUniforms = function() {
		var invertedPoleLat, sinP, cosP;
		
		invertedPoleLat = Math.PI - poleLat;
		sinP = Math.sin(invertedPoleLat);
		cosP = Math.cos(invertedPoleLat);
       	return {
			"projectionID" : this.getID(),
			"c" : c,
			"rho0" : rho0,
			"n" : n,
			"sinLatPole" : sinP,
			"cosLatPole" : cosP,
			"falseNorthing" : dy
		};
	};

	this.getID = function() {
		return 11;
	};

	this.getFalseNorthing = function() {
		return dy;
	};
}
/**
 * Canters, F. (2002) Small-scale Map projection Design. p. 218-219.
 * Modified Sinusoidal, equal-area.
 */
function Canters1() {"use strict";

	var C1 = 1.1966, C3 = -0.1290, C3x3 = 3 * C3, C5 = -0.0076, C5x5 = 5 * C5;

	this.toString = function() {
		return 'Canters Modified Sinusoidal I';
	};

	this.isEqualArea = function() {
		return true;
	};

	this.forward = function(lon, lat, xy) {
		var y2 = lat * lat;
		var y4 = y2 * y2;
		xy[0] = lon * Math.cos(lat) / (C1 + C3x3 * y2 + C5x5 * y4);
		xy[1] = lat * (C1 + C3 * y2 + C5 * y4);
	};

	this.inverse = function(x, y, lonlat) {
		// tolerance for approximating longitude and latitude
		// less than a hundreth of a second
		var TOL = 0.000000001;

		// maximum number of loops
		var MAX_LOOP = 1000;

		var HALFPI = Math.PI * 0.5;
		var counter = 0;
		var dx, dy;
		var lon = 0;
		var lat = 0;
		var xy = [];

		do {
			// forward projection
			this.forward(lon, lat, xy);
			// horizontal difference in projected coordinates
			dx = x - xy[0];
			// add half of the horizontal difference to the longitude
			lon += dx * 0.5;

			// vertical difference in projected coordinates
			if (dy == y - xy[1]) {
				// the improvement to the latitude did not change with this iteration
				// this is the case for polar latitudes
				lat = lat > 0 ? HALFPI : -HALFPI;
				dy = 0;
			} else {
				dy = y - xy[1];
			}

			// add half of the vertical difference to the latitude
			lat += dy * 0.5;

			// to guarantee stable forward projections,
			// latitude must not go beyond +/-PI/2
			if (lat < -HALFPI) {
				lat = -HALFPI;
			}
			if (lat > HALFPI) {
				lat = HALFPI;
			}

			// stop if it is not converging
			if (counter++ === MAX_LOOP) {
				lon = NaN;
				lat = NaN;
				break;
			}

			// stop when difference is small enough
		} while (dx > TOL || dx < -TOL || dy > TOL || dy < -TOL);

		if (lon > Math.PI || lon < -Math.PI || lat > HALFPI || lat < -HALFPI) {
			lonlat[0] = NaN;
			lonlat[1] = NaN;
			return;
		}
		lonlat[0] = lon;
		lonlat[1] = lat;
	};

	this.getOutline = function() {
		return GraticuleOutline.pseudoCylindricalOutline(this);
	};

	this.getShaderUniforms = function() {
		return {
			"projectionID" : this.getID()
		};
	};

	this.getID = function() {
		return 53287562; // random number
	};
}
/**
 * Canters, F. (2002) Small-scale Map projection Design. p. 218-220.
 * Modified Sinusoidal, equal-area.
 */
function Canters2() {"use strict";
	
	var C1 = 1.1481, C3 = -0.0753, C3x3 = 3 * C3, C5 = -0.0150, C5x5 = 5 * C5;

	this.toString = function() {
		return 'Canters Modified Sinusoidal II';
	};

	this.isEqualArea = function() {
		return true;
	};

	this.forward = function(lon, lat, xy) {
		var y2 = lat * lat;
		var y4 = y2 * y2;
		xy[0] = lon * Math.cos(lat) / (C1 + C3x3 * y2 + C5x5 * y4);
		xy[1] = lat * (C1 + C3 * y2 + C5 * y4);
	};

	this.inverse = function(x, y, lonlat) {
		// tolerance for approximating longitude and latitude
		// less than a hundreth of a second
		var TOL = 0.000000001;

		// maximum number of loops
		var MAX_LOOP = 1000;

		var HALFPI = Math.PI * 0.5;
		var counter = 0;
		var dx, dy;
		var lon = 0;
		var lat = 0;
		var xy = [];

		do {
			// forward projection
			this.forward(lon, lat, xy);
			// horizontal difference in projected coordinates
			dx = x - xy[0];
			// add half of the horizontal difference to the longitude
			lon += dx * 0.5;

			// vertical difference in projected coordinates
			if (dy == y - xy[1]) {
				// the improvement to the latitude did not change with this iteration
				// this is the case for polar latitudes
				lat = lat > 0 ? HALFPI : -HALFPI;
				dy = 0;
			} else {
				dy = y - xy[1];
			}

			// add half of the vertical difference to the latitude
			lat += dy * 0.5;

			// to guarantee stable forward projections,
			// latitude must not go beyond +/-PI/2
			if (lat < -HALFPI) {
				lat = -HALFPI;
			}
			if (lat > HALFPI) {
				lat = HALFPI;
			}

			// stop if it is not converging
			if (counter++ === MAX_LOOP) {
				lon = NaN;
				lat = NaN;
				break;
			}

			// stop when difference is small enough
		} while (dx > TOL || dx < -TOL || dy > TOL || dy < -TOL);

		if (lon > Math.PI || lon < -Math.PI || lat > HALFPI || lat < -HALFPI) {
			lonlat[0] = NaN;
			lonlat[1] = NaN;
			return;
		}
		lonlat[0] = lon;
		lonlat[1] = lat;
	};

	this.getOutline = function() {
		return GraticuleOutline.pseudoCylindricalOutline(this);
	};

	this.getShaderUniforms = function() {
		return {
			"projectionID" : this.getID()
		};
	};

	this.getID = function() {
		return 38426587; // random number
	};

}
function Eckert4() {"use strict";

	var C_x = 0.42223820031577120149;
	var C_y = 1.32650042817700232218;
	var C_p = 3.57079632679489661922;
	var EPS = 1.0e-7;
	var NITER = 6;
	var ONE_TOL = 1.00000000000001;
	var HALFPI = Math.PI / 2;

	this.toString = function() {
		return 'Eckert IV';
	};

	this.isEqualArea = function() {
		return true;
	};

	this.forward = function(lon, lat, xy) {

		var p, V, s, c, i;
		p = C_p * Math.sin(lat);
		V = lat * lat;
		lat *= 0.895168 + V * (0.0218849 + V * 0.00826809);
		for ( i = NITER; i > 0; --i) {
			c = Math.cos(lat);
			s = Math.sin(lat);
			lat -= V = (lat + s * (c + 2) - p) / (1 + c * (c + 2) - s * s);
			if (Math.abs(V) < EPS) {
				xy[0] = C_x * lon * (1 + Math.cos(lat));
				xy[1] = C_y * Math.sin(lat);
				return;
			}
		}
		xy[0] = C_x * lon;
		xy[1] = lat < 0 ? -C_y : C_y;
	};

	this.inverse = function(x, y, lonlat) {
		// arcsine with tolerance
		var v = y / C_y;
		var abs = Math.abs(v);
		if (abs >= 1) {
			if (abs >= ONE_TOL) {
				lonlat[0] = NaN;
				lonlat[1] = NaN;
				return;
			} else {
				y = v < 0 ? -HALFPI : HALFPI;
			}
		} else {
			y = Math.asin(v);
		}

		var c = Math.cos(y);
		var lon = x / (C_x * (1 + (c)));
		if (lon > Math.PI || lon < -Math.PI) {
			lonlat[0] = NaN;
			lonlat[1] = NaN;
			return;
		} else {
			lonlat[0] = lon;
		}

		// arcsine with tolerance
		v = (y + Math.sin(y) * (c + 2)) / C_p;
		if ( abs = Math.abs(v) >= 1) {
			if (abs >= ONE_TOL) {
				lonlat[0] = NaN;
				lonlat[1] = NaN;
				return;
			} else {
				lonlat[1] = v < 0 ? -HALFPI : HALFPI;
			}
		} else {
			lonlat[1] = Math.asin(v);
		}
	};

	this.getOutline = function() {
		return GraticuleOutline.pseudoCylindricalOutline(this);
	};
}
function Geographic() {"use strict";

    var MAX_Y = Math.PI / 2;

    this.toString = function() {
        return 'Plate Carr\u00E9e (Geographic)';
    };

    this.isEqualArea = function() {
        return false;
    };
	
    this.forward = function(lon, lat, xy) {
        xy[0] = lon;
        xy[1] = lat;
    };

    this.inverse = function(x, y, lonlat) {
        if (y > MAX_Y || y < -MAX_Y || x > Math.PI || x < -Math.PI) {
            lonlat[0] = NaN;
            lonlat[1] = NaN;
        } else {
            lonlat[1] = y;
            lonlat[0] = x;
        }
    };

    this.getOutline = function() {
        return GraticuleOutline.rectangularOutline(this, MAX_Y, -Math.PI, -MAX_Y, Math.PI);
    };

    this.getShaderUniforms = function() {
        return {
            "projectionID" : this.getID()
        };
    };

    this.getID = function() {
        return 4979;
    };
}
function LambertAzimuthalEqualAreaOblique() {"use strict";

    var EPS10 = 1.e-10, lat0, cosLat0, sinLat0;

    lat0 = 0;
    cosLat0 = 1;
    sinLat0 = 0;

    this.toString = function() {
        var txt = 'Lambert Azimuthal ';
        txt += Math.abs(lat0) < Math.PI / 2 - EPS10 ? 'Oblique' : 'Polar';
        return txt;
    };

    this.isEqualArea = function() {
        return true;
    };

    this.initialize = function(conf) {
        lat0 = conf.lat0;
        cosLat0 = Math.cos(lat0);
        sinLat0 = Math.sin(lat0);
    };

    this.forward = function(lon, lat, xy) {
        var sinLat = Math.sin(lat);
        var cosLat = Math.cos(lat);
        var cosLon = Math.cos(lon);
        var sinLon = Math.sin(lon);
        var y = 1 + sinLat0 * sinLat + cosLat0 * cosLat * cosLon;
        // the projection is indeterminate for lon = PI and lat = -lat0
        // this point would have to be plotted as a circle
        // The following Math.sqrt will return NaN in this case.
        y = Math.sqrt(2 / y);
        xy[0] = y * cosLat * sinLon;
        xy[1] = y * (cosLat0 * sinLat - sinLat0 * cosLat * cosLon);
    };

    this.inverse = function(x, y, lonlat) {
        var dd = x * x + y * y;
        if (dd > 4) {
            lonlat[0] = NaN;
            lonlat[1] = NaN;
            return;
        }
        var rh = Math.sqrt(dd);
        var phi = rh * 0.5;
        phi = 2. * Math.asin(phi);
        var sinz = Math.sin(phi);
        var cosz = Math.cos(phi);
        lonlat[1] = phi = (rh <= EPS10) ? lat0 : Math.asin(cosz * sinLat0 + y * sinz * cosLat0 / rh);
        x *= sinz * cosLat0;
        y = (cosz - Math.sin(phi) * sinLat0) * rh;
        lonlat[0] = (y === 0) ? 0 : Math.atan2(x, y);
    };

    this.getOutline = function() {
        return GraticuleOutline.circularOutline(2);
    };

    this.getShaderUniforms = function() {
        return {
            "projectionID" : this.getID(),
            "sinLatPole" : sinLat0,
            "cosLatPole" : cosLat0

        };
    };

    this.getID = function() {
        return 28;
    };
}
/*globals GraticuleOutline */
//Lambert Azimuthal Equal-Area Projection polar aspect

// The equatorial Lambert azimuthal in the vertex shader creates artifacts, which are due to the
// limited precision of single precision floating point values.
// Degenerate cases are created with the sqrt function applied to very small numbers.
// The polar aspects are more stable and also faster to evaluate as less math calls are required.

// Equatorial equations after Snyder with artifacts in GLSL:
// float k = sqrt(2. / (1. + cosLat * cosLon));
// float x = k * cosLat * sinLon;
// float y = k * sinLat;

function LambertAzimuthalEqualAreaPolar() {"use strict";

    var FORTPI = Math.PI / 4, southPole = false;

    // FIXME is this needed?
    var dy = 0;

    this.toString = function() {
        return 'Lambert Azimuthal';
    };

    this.isEqualArea = function() {
        return true;
    };

    function forwardNorthPole(lon, lat, xy) {
        var y = 2 * Math.sin(FORTPI - lat * 0.5);
        xy[0] = y * Math.sin(lon);
        xy[1] = y * -Math.cos(lon);
    }

    function forwardSouthPole(lon, lat, xy) {
        var y = 2 * Math.cos(FORTPI - lat * 0.5);
        xy[0] = y * Math.sin(lon);
        xy[1] = y * Math.cos(lon);
    }

    function inverseNorthPole(x, y, lonlat) {
        var rh, phi;
        y -= dy;
        rh = Math.sqrt(x * x + y * y);
        phi = rh * 0.5;
        lonlat[0] = Math.atan2(x, -y);
        if (phi > 1) {
            lonlat[1] = Math.PI / 2;
        } else {
            lonlat[1] = 2 * (FORTPI - Math.asin(phi));
        }
    }

    function inverseSouthPole(x, y, lonlat) {
        var rh, phi;
        y -= dy;
        rh = Math.sqrt(x * x + y * y);
        phi = rh * 0.5;
        lonlat[0] = Math.atan2(x, y);
        if (phi > 1) {
            lonlat[1] = -Math.PI / 2;
        } else {
            lonlat[1] = 2 * (-FORTPI + Math.asin(phi));
        }
    }


    this.initialize = function(conf) {
        southPole = conf.lat0 < 0;
        if (southPole) {
            this.forward = forwardSouthPole;
            this.inverse = inverseSouthPole;
        } else {
            this.forward = forwardNorthPole;
            this.inverse = inverseNorthPole;
        }
    };

    // invoke initialize() to create this.forward and this.inverse
    this.initialize({
        lat0 : Math.PI / 2
    });

    this.getOutline = function() {
        return GraticuleOutline.circularOutline(2);
    };

    this.getShaderUniforms = function() {
        return {
            "projectionID" : this.getID(),
            "falseNorthing" : dy
        };
    };

    this.getFalseNorthing = function() {
        return dy;
    };

    // FIXME setFalseNorthing?
    this.setVerticalShift = function(verticalShift) {
        dy = verticalShift;
    };

    this.getID = function() {
        return southPole ? -3 : -2;
    };
}
/*globals GraticuleOutline*/

function LambertAzimuthalEquatorial() {"use strict";

    var FORTPI = Math.PI / 4, EPS10 = 1.e-10;

    this.toString = function() {
        return 'Lambert Azimuthal';
    };

    this.isEqualArea = function() {
        return true;
    };

    this.initialize = function(conf) {
    };

    this.forward = function(lon, lat, xy) {
        var k = 2 * Math.sin(FORTPI - lat * 0.5);
        xy[0] = k * Math.sin(lon);
        xy[1] = k * -Math.cos(lon);
        /*
        var x, y, sinLat = Math.sin(lat), cosLat = Math.cos(lat), cosLon = Math.cos(lon), sinLon = Math.sin(lon);
        y = 1 + cosLat * cosLon;
        if (y < EPS10) {
            xy[0] = NaN;
            xy[1] = NaN;
        } else {
            y = Math.sqrt(2 / y);
            x = y * cosLat * sinLon;
            y *= sinLat;

            xy[0] = x;
            xy[1] = y;
        }*/
    };

    this.inverse = function(x, y, lonlat) {
        var cosz, rh, sinz, phi;

        rh = Math.sqrt(x * x + y * y);
        phi = rh * 0.5;
        if (phi > 1) {
            lonlat[0] = NaN;
            lonlat[1] = NaN;
            return;
        }
        phi = 2 * Math.asin(phi);
        sinz = Math.sin(phi);
        cosz = Math.cos(phi);

        lonlat[1] = (Math.abs(rh) <= EPS10) ? 0 : Math.asin(y * sinz / rh);
        x *= sinz;
        y = cosz * rh;
        lonlat[0] = (y === 0) ? 0 : Math.atan2(x, y);
    };

    this.getOutline = function() {
        return GraticuleOutline.circularOutline(2);
    };

    this.getShaderUniforms = function() {
        return {
            "projectionID" : this.getID()
        };
    };

    this.getID = function() {
        return 28;
    };
}
/*globals GraticuleOutline */

function LambertCylindricalEqualArea() {"use strict";

    var dy = 0;

    this.toString = function() {
        return 'Lambert Cylindrical Equal Area';
    };

    this.isEqualArea = function() {
        return true;
    };

    this.isCylindrical = function() {
        return true;
    };

    this.forward = function(lon, lat, xy) {
        xy[0] = lon;
        xy[1] = Math.sin(lat);
    };

    this.inverse = function(x, y, lonlat) {
        var lat = Math.asin(y - dy);
        if (x > Math.PI || x < -Math.PI || isNaN(lat)) {
            lonlat[0] = NaN;
            lonlat[1] = NaN;
        } else {
            lonlat[0] = x;
            lonlat[1] = lat;
        }
    };
    
    this.initialize = function() {
    };

    this.getOutline = function() {
        return GraticuleOutline.rectangularOutline(this, Math.PI / 2, -Math.PI, -Math.PI / 2, Math.PI);
    };

    this.getShaderUniforms = function() {
        return {
            "projectionID" : this.getID(),
            "falseNorthing" : dy
        };
    };

    this.getFalseNorthing = function() {
        return dy;
    };

    // FIXME setFalseNorthing?
    this.setVerticalShift = function(verticalShift) {
        dy = verticalShift;
    };

    this.getID = function() {
        return -1;
    };
}
/*globals GraticuleOutline */
function LambertTransverseCylindricalEqualArea() {"use strict";

    // FIXME wrong name. Lambert cylindrical has lat0 = 0.  This is a general cylindrical equal area projection
    var lat0 = 0,

    // scale factor along central meridian
    k0 = 1;

    this.toString = function() {
        return 'Lambert Transverse Cylindrical';
    };

    this.isEqualArea = function() {
        return true;
    };

    this.initialize = function(conf) {
        lat0 = conf.lat0;
        // FIXME create second versions of forward and inverse for cases when lat0 == 0
    };

    this.forward = function(lon, lat, xy) {
        xy[0] = Math.cos(lat) * Math.sin(lon) / k0;
        xy[1] = k0 * (Math.atan2(Math.tan(lat), Math.cos(lon)) - lat0);
    };

    this.inverse = function(x, y, lonlat) {
        var t, D, r;
        t = x * k0;
        r = Math.sqrt(1 - t * t);
        D = y / k0 + lat0;
        lonlat[1] = Math.asin(r * Math.sin(D));
        lonlat[0] = Math.atan2(t, (r * Math.cos(D)));
    };

    this.getOutline = function() {
        var pts = [];
        pts[0] = -1;
        pts[1] = Math.PI - lat0;
        pts[2] = 1;
        pts[3] = Math.PI - lat0;
        pts[4] = 1;
        pts[5] = -Math.PI - lat0;
        pts[6] = -1;
        pts[7] = -Math.PI - lat0;
        return pts;
    };

    this.getShaderUniforms = function() {
        return {
            "projectionID" : this.getID(),
            "falseNorthing" : -lat0
        };
    };

    this.getID = function() {
        // EPSG::9834 Lambert Cylindrical Equal Area (Spherical)
        // minus sign for transverse
        return -9834;
    };
}
/*globals GraticuleOutline*/
function Mercator() {"use strict";

    var PI_HALF = Math.PI / 2, WEB_MERCATOR_MAX_LAT = 1.4844222297453322, dy = 0;

    this.toString = function() {
        return 'Mercator';
    };

    this.isEqualArea = function() {
        return false;
    };

    this.isConformal = function() {
        return true;
    };

    this.initialize = function(conf) {
        // compute vertical shift for Mercator projection
        // such that the central latitude appears in the center of the map.
        var xy = [];
        this.forward(0, conf.lat0, xy);
        dy = -xy[1];
    };

    this.setVerticalShift = function(verticalShift) {
        dy = verticalShift;
    };

    this.forward = function(lon, lat, xy) {
        xy[0] = lon;
        if (lat > WEB_MERCATOR_MAX_LAT) {
            lat = WEB_MERCATOR_MAX_LAT;
        } else if (lat < -WEB_MERCATOR_MAX_LAT) {
            lat = -WEB_MERCATOR_MAX_LAT;
        }
        xy[1] = Math.log(Math.tan(0.5 * (PI_HALF + lat))) + dy;
    };

    this.inverse = function(x, y, lonlat) {
        lonlat[0] = x;
        lonlat[1] = PI_HALF - 2 * Math.atan(Math.exp(-y + dy));
    };

    this.getOutline = function() {
        return GraticuleOutline.rectangularOutline(this, WEB_MERCATOR_MAX_LAT, -Math.PI, -WEB_MERCATOR_MAX_LAT, Math.PI);
    };

    this.getShaderUniforms = function() {
        return {
            "projectionID" : this.getID(),
            "falseNorthing" : dy
        };
    };

    this.getID = function() {
        // EPSG:3857 web Mercator
        return 3857;
    };
}
function Mollweide() {"use strict";

    var MAX_ITER = 10;
    var TOLERANCE = 1.0e-7;
    var ONE_TOL = 1.00000000000001;
    var HALFPI = Math.PI / 2;
    var cx, cy, cp;

    this.toString = function() {
        return 'Mollweide';
    };

    this.isEqualArea = function() {
        return true;
    };

    // FIXME
    (function() {
        var p = Math.PI / 2, r, sp, p2 = p + p;
        sp = Math.sin(p);
        r = Math.sqrt(Math.PI * 2.0 * sp / (p2 + Math.sin(p2)));
        cx = 2 * r / Math.PI;
        cy = r / sp;
        cp = p2 + Math.sin(p2);
    })();

    this.forward = function(lon, lat, xy) {
        var k, v, i;
        k = cp * Math.sin(lat);
        for ( i = MAX_ITER; i !== 0; i--) {
            lat -= v = (lat + Math.sin(lat) - k) / (1 + Math.cos(lat));
            if (Math.abs(v) < TOLERANCE) {
                break;
            }
        }
        if (i === 0) {
            lat = (lat < 0) ? -Math.PI / 2 : Math.PI / 2;
        } else {
            lat *= 0.5;
        }
        xy[0] = cx * lon * Math.cos(lat);
        xy[1] = cy * Math.sin(lat);
    };

    this.inverse = function(x, y, lonlat) {
        var abs, lon, lat;
        y = y / cy;
        abs = Math.abs(y);
        // arcsine with tolerance
        if (abs > 1) {
            if (abs >= ONE_TOL) {
                lonlat[0] = NaN;
                lonlat[1] = NaN;
                return;
            }
            lat = y < 0 ? -HALFPI : HALFPI;
        } else {
            lat = Math.asin(y);
        }

        lon = x / (cx * Math.cos(lat));
        if (lon > Math.PI || lon < -Math.PI) {
            lonlat[0] = NaN;
            lonlat[1] = NaN;
            return;
        }
        
        lonlat[0] = lon;
        lat += lat;
        lat = (lat + Math.sin(lat)) / cp;

        // sarcsine with tolerance
        abs = Math.abs(lat);
        if (abs >= 1) {
            if (abs > ONE_TOL) {
                lonlat[0] = NaN;
                lonlat[1] = NaN;
            } else {
                lonlat[1] = lat < 0 ? -HALFPI : HALFPI;
            }
        } else {
            lonlat[1] = Math.asin(lat);
        }
    };

    this.getOutline = function() {
        return GraticuleOutline.pointedPoleOutline(this);
    };

    this.getID = function() {
        return 54009;
    };
}
function NaturalEarth() {"use strict";

    var MAX_Y = 0.8707 * 0.52 * Math.PI;

    this.toString = function() {
        return 'Natural Earth';
    };
    
    this.isEqualArea = function() {
		return false;
	};

    this.forward = function(lon, lat, xy) {
        var lat2 = lat * lat, lat4 = lat2 * lat2;
        xy[0] = lon * (0.8707 - 0.131979 * lat2 + lat4 * (-0.013791 + lat4 * (0.003971 * lat2 - 0.001529 * lat4)));
        xy[1] = lat * (1.007226 + lat2 * (0.015085 + lat4 * (-0.044475 + 0.028874 * lat2 - 0.005916 * lat4)));
    };

    this.inverse = function(x, y, lonlat) {
        var yc, tol, y2, y4, f, fder, lon;

        if (y > MAX_Y || y < -MAX_Y) {
            lonlat[0] = NaN;
            lonlat[1] = NaN;
            return;
        }

        // Newton's method for the latitude
        yc = y;
        for (; ; ) {
            y2 = yc * yc;
            y4 = y2 * y2;
            f = (yc * (1.007226 + y2 * (0.015085 + y4 * (-0.044475 + 0.028874 * y2 - 0.005916 * y4)))) - y;
            fder = 1.007226 + y2 * (0.015085 * 3 + y4 * (-0.044475 * 7 + 0.028874 * 9 * y2 - 0.005916 * 11 * y4));
            yc -= tol = f / fder;
            if (Math.abs(tol) < 0.0000000001) {
                break;
            }
        }

        // longitude
        y2 = yc * yc;
        lon = x / (0.8707 + y2 * (-0.131979 + y2 * (-0.013791 + y2 * y2 * y2 * (0.003971 - 0.001529 * y2))));
        if (lon > Math.PI || lon < -Math.PI) {
            lonlat[0] = NaN;
            lonlat[1] = NaN;
        } else {
            lonlat[0] = lon;
            lonlat[1] = yc;
        }
    };

    this.getOutline = function() {
        return GraticuleOutline.pseudoCylindricalOutline(this);
    };

    this.getShaderUniforms = function() {
        return {
            // random number
            "projectionID" : 7259365.0
        };
    };

    this.getID = function() {
        return 7259365;
    };
}
// FIXME move following functions in utility file

// FIXME there should be a better method to do this
/* reduce argument to range +/- PI */
function adjlon(lon) {
    var SPI = 3.14159265359, TWOPI = 2 * Math.PI;

    if (Math.abs(lon) <= SPI) {
        return lon;
    }
    // adjust to 0..2pi rad
    lon += Math.PI;
    // remove integral # of 'revolutions'
    lon -= TWOPI * Math.floor(lon / TWOPI);
    // adjust back to -pi..pi rad
    lon -= Math.PI;
    return lon;
}

function aasin(v) {
    var ONE_TOL = 1.00000000000001, av = Math.abs(v);
    if (av >= 1) {
        if (av > ONE_TOL) {
            return NaN;
        }
        return v < 0 ? -Math.PI / 2 : Math.PI / 2;
    }
    return Math.asin(v);
}

function aatan2(n, d) {
    var ATOL = 1.0e-50;
    return ((Math.abs(n) < ATOL && Math.abs(d) < ATOL) ? 0 : Math.atan2(n, d));
}

function ProjectionFactory() {
}

ProjectionFactory.getSmallScaleProjection = function(smallScaleProjectionName) {
    switch (smallScaleProjectionName) {
        case 'Canters1':
            return new Canters1();
        case 'Canters2':
            return new Canters2();
        case 'CylindricalEqualArea':
            return TransformedLambertAzimuthal.LambertCylindrical();
        case 'Eckert4':
            return new Eckert4();
        case 'Geographic':
            return new Geographic();
        case 'Mollweide':
            return new Mollweide();
        case 'NaturalEarth':
            return new NaturalEarth();
        case 'PseudoCylindricalEqualArea':
            return TransformedLambertAzimuthal.PseudoCylindricalEqualArea();
        case 'QuarticAuthalic':
            return TransformedLambertAzimuthal.QuarticAuthalic();
        case 'Robinson':
            return new Robinson();
        case 'Sinusoidal':
            return new Sinusoidal();
        case 'Wagner7':
            return TransformedLambertAzimuthal.Wagner7();
        default:
            return TransformedLambertAzimuthal.Hammer();
    }
};

ProjectionFactory.create = function(conf) {

    function smallScaleVerticalShift(conf, proj) {
        if (conf.lat0 === 0 || conf.mapScale < 1) {
            return 0;
        }
        var mapH = conf.mapDimension[1];
        if (mapH > ProjectionFactory.halfCentralMeridianLengthOfSmallScaleProjection(proj)) {
            // the canvas is larger than the graticule
            return 0;
        }

        // only a part of the graticule is visible
        var pt = [];
        proj.forward(0, conf.lat0, pt);
        var dy = -pt[1];
        var dMax = ProjectionFactory.halfCentralMeridianLengthOfSmallScaleProjection(proj) - mapH;
        if (dy > dMax) {
            dy = dMax;
        } else if (dy < -dMax) {
            dy = -dMax;
        }
        return dy;
    }

    function smallScaleTransformation(conf, proj) {

        var poleLat, dy;

        if (conf.rotateSmallScale) {
            poleLat = Math.PI / 2 - conf.lat0;
            return new TransformedProjection(proj, 0, poleLat, true);
        } else {
            // we could use this: return ;
            // the following alternative is more efficient, but adds an additional function call.
            dy = smallScaleVerticalShift(conf, proj);
            proj.falseNorthing = dy;
            proj = new ShiftedProjection(proj, dy);
            proj.falseNorthing = dy;

            /*
             // override the inverse function to take the false northing into account
             (function() {
             var originalInverse, falseNorthing;
             // store reference to original
             originalInverse = proj.inverse;
             falseNorthing = dy;
             // Define overriding method.
             proj.inverse = function() {
             arguments[1] -= falseNorthing;
             // Execute the original method.
             return originalInverse.apply(this, arguments);
             };
             })();
             */
            return proj;
        }
    }

    function getMediumToLargeScaleProjectionForPortraitFormat(conf) {
        var w = (conf.mapScale - conf.scaleLimit4) / (conf.scaleLimit5 - conf.scaleLimit4);
        var p1 = new LambertTransverseCylindricalEqualArea();
        p1.initialize(conf);
        var p2 = new LambertAzimuthalEqualAreaOblique();
        p2.initialize(conf);
        return new WeightedProjectionMix(p1, p2, w);
    }

    function useCylindrical(conf) {
        var xy = [];
        var m = conf.cylindricalLowerLat / (conf.scaleLimit5 - conf.scaleLimit4);
        var c = conf.cylindricalLowerLat - m * conf.scaleLimit5;
        var latLimit = m * conf.mapScale + c;

        // FIXME hack: add transformation from azimuthal to cylindrical
        // replace if condition with 
        // if (Math.abs(conf.lat0) < conf.cylindricalLowerLat) {
        
         if (Math.abs(conf.lat0) < latLimit) {
            var cylProj = new LambertCylindricalEqualArea();
            // compute vertical shift for cylindrical projection
            // such that the central latitude appears in the center of the map.
            cylProj.forward(0, conf.lat0, xy);
            cylProj.setVerticalShift(-xy[1]);
            // for GUI display, void unused standard latitudes
            conf.lat1 = NaN;
            conf.lat2 = NaN;
            return cylProj;
        }
    }

    function getMediumToLargeScaleConicProjectionForLandscapeFormat(conf) {

        // Scale is between conf.scaleLimit4 and conf.scaleLimit5.
        // Use an oblique Albers conic projection that smoothly blends between
        // the medium scale azimuthal and the large scale conic as scale changes.
        // For scales close to the medium-scale azimuthal projection, the two standard
        // parallels and the central latitude of the conic projection are close to
        // the pole. This results in a conic projection that is almost azimuthal and
        // centered on a pole. The globe is additionally rotated to bring the
        // central latitude to the center of the canvas.

        // compute rotation angle and vertical shift applied to medium-scale
        // azimuthal projection for the scale equal to conf.scaleLimit4

        var azimuthalProj = new LambertAzimuthalEqualAreaOblique();
        azimuthalProj.initialize(conf);

        // compute the vertical shift
        var w = (conf.scaleLimit5 - conf.mapScale) / (conf.scaleLimit5 - conf.scaleLimit4);
        var dy = Math.abs(conf.topPt[1] - conf.bottomPt[1]) / 2 * w;
        if (conf.lat0 < 0) {
            dy = -dy;
        }

        // compute the rotation angle latRot that is applied to recenter the shifted graticule
        var t = new ShiftedProjection(azimuthalProj, dy);
        var centerLonLat = [];
        t.inverse(conf.centerXY[0], conf.centerXY[1], centerLonLat);
        var latRot = conf.lat0 - centerLonLat[1];

        // standard parallels of the conic with normal aspect and rotated globe
        var largeScaleAlbers = ProjectionFactory.largeScaleAlbersConicForLandscapeFormat(conf);
        var lat0Conic = conf.lat0;
        var lat1Conic = largeScaleAlbers.lat1;
        var lat2Conic = largeScaleAlbers.lat2;
        // position of north pole counted from equator
        var poleLatConic = Math.PI / 2 - latRot;

        // standard parallels of a "flat" conic that corresponds to an azimuthal on north or south pole
        var lat0Azimuthal, lat1Azimuthal, lat2Azimuthal, poleLatAzimuthal;
        if (conf.lat0 > 0) {
            // central latitude and standard parallels are on the north pole
            lat0Azimuthal = lat1Azimuthal = lat2Azimuthal = Math.PI / 2;
            // the north pole is rotated from its normal position at 90 deg by (90-lat0)
            poleLatAzimuthal = Math.PI - conf.lat0 - latRot;
        } else {
            // central latitude and standard parallels are on the south pole
            lat0Azimuthal = lat1Azimuthal = lat2Azimuthal = -Math.PI / 2;
            // north pole moves towards the equator
            poleLatAzimuthal = -conf.lat0 - latRot;
        }

        // blend values for the oblique conic
        var w1 = (conf.scaleLimit5 - conf.mapScale) / (conf.scaleLimit5 - conf.scaleLimit4);
        var w2 = 1 - w1;
        var obliqueConicConf = {
            lat0 : w1 * lat0Azimuthal + w2 * lat0Conic,
            lat1 : w1 * lat1Azimuthal + w2 * lat1Conic,
            lat2 : w1 * lat2Azimuthal + w2 * lat2Conic,
            poleLat : w1 * poleLatAzimuthal + w2 * poleLatConic
        };

        // adjust standard parallels for GUI display
        // FIXME
        conf.lat1 = conf.lat0 + (obliqueConicConf.lat0 - obliqueConicConf.lat1);
        conf.lat2 = conf.lat0 + (obliqueConicConf.lat0 - obliqueConicConf.lat2);

        var obliqueConicProj = new AlbersConicEqualAreaOblique(dy);
        obliqueConicProj.initialize(obliqueConicConf);
        return obliqueConicProj;
    }

    function getMediumToLargeScaleProjectionForLandscapeFormat(conf) {

        // FIXME transition between cylindrical and conic
        var cylProj = useCylindrical(conf);
        if (cylProj) {
            return cylProj;
        }

        // use azimuthal projection to show poles
        if (Math.abs(conf.lat0) > conf.polarUpperLat) {
            return ProjectionFactory.shiftedLambertAzimuthalPolar(conf);
        }

        return getMediumToLargeScaleConicProjectionForLandscapeFormat(conf);
    }

    function getMediumScaleProjection(conf) {
        var landscapeFormat, polarAziProj, dy, dx, m, c, y, xl, w, lat0, conicPoleY, poleSign;

        landscapeFormat = (conf.canvasHeight / conf.canvasWidth) < conf.formatRatioLimit;
        if (landscapeFormat) {
            // interpolate lat0 of Lambert azimuthal projection. For scales larger
            // than conf.scaleLimit4, a polar azimuthal without spherical rotation is used near poles.
            // Interpolate towards this polar projection.
            dy = Math.PI / 2 - conf.polarUpperLat;
            dx = conf.scaleLimit4 - conf.scaleLimit2;
            m = -dy / dx;
            c = Math.PI / 2 - m * conf.scaleLimit2;
            y = conf.mapScale * m + c;
            if (Math.abs(conf.lat0) > y) {
                xl = (Math.abs(conf.lat0) - c) / m;
                w = (conf.mapScale - xl) / (conf.scaleLimit4 - xl);
                
                // lat0 is 90deg when north pole is at the center of the map 
                poleSign = (conf.lat0 > 0) ? 1 : -1;
                lat0 = (conf.lat0 - poleSign * Math.PI / 2) * w + poleSign * Math.PI - conf.lat0;

                // compute vertical shift of the azimuthal projection
                conicPoleY = ProjectionFactory.verticalCoordinateOfFlattenedAlbersConicPole(conf);
                dy = conf.centerXY[1] - conicPoleY;
                return new TransformedProjection(new LambertAzimuthalEqualAreaPolar(), -dy * w, lat0, true);
            }
        }
        // the meta pole is not at Math.PI / 2 - conf.lat0 as for global projections, because
        // we are using a polar Lambert azimuthal, not an equatorial.
        return new TransformedProjection(new LambertAzimuthalEqualAreaPolar(), 0, Math.PI - conf.lat0, true);
    }

    /**
     * Returns a projection for a zoom level between conf.scaleLimit1 and conf.scaleLimit2.
     * Creates a transformed Lambert azimuthal or a mix of two projection.
     * For both cases, a vertical shift may be needed if the projection for world maps cannot be rotated.
     */
    function getSmallToMediumScaleProjection(conf) {
        var projection, w, poleLat, p1, p2, dy;

        projection = ProjectionFactory.getSmallScaleProjection(conf.smallScaleProjectionName);

        // weight is linear interpolation between two scale limits
        w = (conf.scaleLimit2 - conf.mapScale) / (conf.scaleLimit2 - conf.scaleLimit1);

        if ( projection instanceof TransformedLambertAzimuthal) {
            // Use a weight for a smooth transition from the transformed to the regular Lambert azimuthal projection
            projection.transformToLambertAzimuthal(w);
        } else {
            // small scale projection is not a transformed Lambert azimuthal
            // create a blend between the small-scale projection and the Lambert azimuthal (via a modified Hammer)
            p1 = ProjectionFactory.getSmallScaleProjection(conf.smallScaleProjectionName);
            // TODO use a transformed Lambert with a pole line when the world projection has a pole line?
            p2 = TransformedLambertAzimuthal.Hammer();
            p2.transformToLambertAzimuthal(w);
            projection = new WeightedProjectionMix(p1, p2, w);
        }

        if (conf.rotateSmallScale) {
            // latitude of the transformed pole
            poleLat = Math.PI / 2 - conf.lat0;
            // no vertical shift
            dy = 0;
        } else {
            // latitude of the transformed pole
            poleLat = Math.PI / 2 - (1 - w) * conf.lat0;
            // compute vertical shift such that lat0 appears at the center of the map when zoomed out
            dy = smallScaleVerticalShift(conf, new TransformedProjection(projection, 0, poleLat, false));
        }
        return new TransformedProjection(projection, dy, poleLat, true);
    }

    /**
     * Returns a projection blend of the large scale projection and the Mercator (used for largest scales)
     */
    function getLargeScaleToMercatorProjection(conf) {
        var w, p1, p2;

        // FIXME add special treatment for central latitudes close to poles, because the
        // web Mercator ends at approx. +/- 85 degrees north and south

        w = (conf.mapScale - conf.mercatorLimit1) / (conf.mercatorLimit2 - conf.mercatorLimit1);
        p1 = new Mercator();
        p1.initialize(conf);
        p2 = ProjectionFactory.createLargeScaleProjection(conf);
        p2.initialize(conf);
        return new WeightedProjectionMix(p1, p2, w);
    }

    function getMediumToLargeScaleProjection(conf) {
        var projection, canvasRatio;
        canvasRatio = conf.canvasHeight / conf.canvasWidth;
        if (canvasRatio < conf.formatRatioLimit) {
            return getMediumToLargeScaleProjectionForLandscapeFormat(conf);
        } else if (canvasRatio > 1 / conf.formatRatioLimit) {
            return getMediumToLargeScaleProjectionForPortraitFormat(conf);
        } else {
            // no transition required for square format maps
            projection = ProjectionFactory.createLargeScaleProjection(conf);
            projection.initialize(conf);
            return projection;
        }
    }

    /**
     * Use a section of an azimuthal Lambert graticule to make sure the wedge of
     * the Albers conic projection is not visible at larger scales (i.e., scale > conf.scaleLimit4).
     * Not the central part of the graticule is used, but as conf.scaleLimit4
     * is approached, a section shifted towards the equator is used.
     * When the scale equals conf.scaleLimit4, the upper border of the
     * graticule equals conf.lat0. This ensures that the wedge of
     * the conic Albers projection is not visible on the map. This wedge
     * vertically disects the graticule from lat0 to the closer pole.
     * The shift for the azimuthal projection at scaleLimit4 is computed as follows:
     * First a normal azimuthal Lambert centered on conf.lat0 is initialized.
     * Then the graticule is vertically shifted by half the height of the map.
     * After this shift, the central latitude lat0 is no longer in the center
     * of the map.
     * Then a rotation angle is computed for a spherical rotation that brings
     * the central latitude lat0 again to the center of the map.
     */
    function getShiftedMediumScaleLandscapeProjection(conf) {
        var w, absLat0, azimuthalProj, m, c, y, latLimit, scaleLimit, dy, t, centerLonLat, poleLat;

        azimuthalProj = new LambertAzimuthalEqualAreaOblique();
        azimuthalProj.initialize(conf);

        absLat0 = Math.abs(conf.lat0);

        if (absLat0 > conf.polarLowerLat) {
            // azimuthal projection close to poles needs special treatment
            // an oblique line forming the upper limit for shifting and rotating the
            // azimuthal projection
            m = (conf.polarUpperLat - conf.polarLowerLat) / (conf.scaleLimit4 - conf.scaleLimit3);
            c = conf.polarUpperLat - m * conf.scaleLimit4;
            latLimit = m * conf.mapScale + c;
            if (absLat0 < latLimit) {
                // lat0 is below the oblique line. Use horizontal interpolation
                // between an oblique line (pos. slope) and a vertical line at conf.scaleLimit4
                // position on oblique line at lat0
                scaleLimit = (absLat0 - c) / m;
                w = (conf.mapScale - scaleLimit) / (conf.scaleLimit4 - scaleLimit);
            } else {
                // lat0 is above the oblique line, use normal azimuthal projection (w = 0)
                return azimuthalProj;
            }
        } else if (absLat0 < conf.cylindricalLowerLat) {
            /*
            // FIXME hack: add transformation from azimuthal to cylindrical
            w = (conf.mapScale - conf.scaleLimit3) / (conf.scaleLimit4 - conf.scaleLimit3);
            var cylProj = TransformedLambertAzimuthal.LambertCylindrical();
            cylProj.transformToLambertAzimuthal(w);
            var dy = -w * conf.lat0;
            var rot = (1 - w) * conf.lat0;
            console.log(w, dy, rot);
            return new TransformedProjection(cylProj, dy, Math.PI / 2 - rot, true);
            */
            
             // azimuthal projection close to equator needs special treatment
             // an oblique line forming the lower limit for shifting and rotating the azimuthal projection
             m = -conf.cylindricalLowerLat / (conf.scaleLimit4 - conf.scaleLimit3);
             c = conf.cylindricalLowerLat - m * conf.scaleLimit3;
             y = m * conf.mapScale + c;
             if (absLat0 > y) {
             // lat0 is above the oblique line. Use horizontal interpolation
             // between an oblique line (neg. slope) and a vertical line at conf.scaleLimit4
             scaleLimit = (absLat0 - c) / m;
             w = (conf.mapScale - scaleLimit) / (conf.scaleLimit4 - scaleLimit);
             } else {
             // lat0 is below the oblique line, use normal azimuthal projection (w = 0)
             return azimuthalProj;
             }
        } else {
            // horizontal interpolation between two scales (two vertical lines in the diagram)
            w = (conf.mapScale - (conf.scaleLimit3)) / (conf.scaleLimit4 - conf.scaleLimit3);
        }

        // the conic wedge starts at the center of the map
        // compute half of the map's height and weight the height with scale
        // the graticule is shifted by this distance to hide the conic wedge
        dy = -(conf.topPt[1] - conf.bottomPt[1]) / 2 * w;
        if (conf.lat0 < 0) {
            dy = -dy;
        }

        // compute the geographic coordinates of the center of the map on the shifted graticule
        t = new ShiftedProjection(azimuthalProj, dy);
        centerLonLat = [];
        t.inverse(conf.centerXY[0], conf.centerXY[1], centerLonLat);

        // compute the rotation angle applied to the sphere to recenter the map
        azimuthalProj.initialize({
            lat0 : centerLonLat[1]
        });
        return new ShiftedProjection(azimuthalProj, -dy);
    }

    function create(conf) {
        var projection, landscapeAspectRatio;

        // make sure parameters are inside valid boundaries
        if (conf.lat0 > Math.PI / 2) {
            conf.lat0 = Math.PI / 2;
        } else if (conf.lat0 < -Math.PI / 2) {
            conf.lat0 = -Math.PI / 2;
        }
        // FIXME: test other parameters for valid values

        landscapeAspectRatio = (conf.canvasHeight / conf.canvasWidth) < conf.formatRatioLimit;

        if (conf.mapScale > conf.mercatorLimit2) {
            // use Mercator for largest scales
            projection = new Mercator();
            projection.initialize(conf);
        } else if (conf.mapScale > conf.mercatorLimit1) {
            // blend large scale projection and the Mercator projection (used for largest scales)
            projection = getLargeScaleToMercatorProjection(conf);
        } else if (conf.mapScale > conf.scaleLimit5) {
            // large scale projection
            // for landscape aspects, a Lambert azimuthal, Albers conic or a cylindrical
            // for portrait aspects, a transverse cylindrical
            // for square aspects, a Lambert azimuthal
            projection = ProjectionFactory.createLargeScaleProjection(conf);
            projection.initialize(conf);
        } else if (conf.mapScale > conf.scaleLimit4) {
            // a large scale projection approximating the medium scale projection
            // for landscape aspects, a large scale projection that is vertically shifted to hide the wedge of the conic
            // for portrait aspects, ?
            // for square aspects, a Lambert azimuthal
            projection = getMediumToLargeScaleProjection(conf);
        } else if (conf.mapScale > conf.scaleLimit3 && landscapeAspectRatio && Math.abs(conf.lat0) < conf.polarUpperLat) {
            // only for landscape aspects
            // Lambert azimuthal vertically shifted for a smooth transition to the shifted large scale projection
            projection = getShiftedMediumScaleLandscapeProjection(conf);
        } else if (conf.mapScale >= conf.scaleLimit2) {
            // Lambert azimuthal
            projection = getMediumScaleProjection(conf);
        } else if (conf.mapScale > conf.scaleLimit1) {
            // small-scale projection blended with Lambert azimuthal for medium scale
            projection = getSmallToMediumScaleProjection(conf);
        } else {
            // conf.mapScale < conf.scaleLimit1
            // small-scale projection
            projection = smallScaleTransformation(conf, ProjectionFactory.getSmallScaleProjection(conf.smallScaleProjectionName));
        }
        return projection;
    }

    return create(conf);
};

ProjectionFactory.halfCentralMeridianLengthOfSmallScaleProjection = function(projection) {
    var xy = [];
    projection.forward(0, Math.PI / 2, xy);
    return xy[1];
};

/**
 * Returns the maximum positive central latitude for a small scale projection
 * with a globe that is not rotated.
 */
ProjectionFactory.smallScaleMaxLat0 = function(mapHeight, proj) {
    var lonLat = [], y;
    // compute the vertical distance in projected coordinates between the equator and
    // the center of the map when the upper border of the map is aligned with the north pole
    // FIXME
    y = ProjectionFactory.halfCentralMeridianLengthOfSmallScaleProjection(proj) - mapHeight;
    proj.inverse(0, y, lonLat);
    return lonLat[1];
};

/**
 * Computes the latitude from which on the azimuthal projection is used for polar areas.
 * If necessary, this latitude limit is moved away from the equator.
 * This is to avoid that the pole is displayed as a line by the conic projection.
 * The polar line would be visible if the pole is shown on the map.
 * All computations are done for the northern hemisphere. The returned latitude is
 * a positive value.
 */
ProjectionFactory.polarLatitudeLimitForAlbersConic = function(topPtY, scale, polarLowerLatLimit, polarUpperLatLimit) {
    if (!polarLowerLatLimit) {
        polarLowerLatLimit = -Math.PI / 2;
    }
    if (!polarUpperLatLimit) {
        polarUpperLatLimit = Math.PI / 2;
    }

    var xy = [];
    var limitLat = polarUpperLatLimit;
    var albersConic = new AlbersConicEqualArea();

    // FIXME: use binary search or Newton-Raphson
    var POL_LAT_INC = 0.1 * Math.PI / 180;
    do {
        // use flattened Albers conic with normal aspect on the north pole, which is
        // equal to the Lambert azimuthal. lat0 is the latitude with the origin of
        // the coordinate system, which will appear in the center of the map.
        albersConic.initialize({
            lat0 : limitLat,
            lat1 : Math.PI / 2,
            lat2 : Math.PI / 2
        });
        albersConic.forward(0, Math.PI / 2, xy);
        limitLat -= POL_LAT_INC;
    } while (xy[1] < topPtY && limitLat > polarLowerLatLimit);
    if (limitLat < polarLowerLatLimit) {
        limitLat = polarLowerLatLimit;
    }
    return limitLat;
};

/**
 * Returns the vertical Y coordinate of the pole in the Albers conic projection.
 * The projection is flattened and centered on a pole, i.e. equal to a polar Lambert
 * azimuthal projection. The coordinate origin is at conf.lat0.
 */
ProjectionFactory.verticalCoordinateOfFlattenedAlbersConicPole = function(conf) {
    var xy = [];
    var conicProj = new AlbersConicEqualArea();
    conicProj.initialize({
        lat0 : conf.lat0,
        lat1 : (conf.lat0 > 0) ? Math.PI / 2 : -Math.PI / 2,
        lat2 : (conf.lat0 > 0) ? Math.PI / 2 : -Math.PI / 2
    });
    conicProj.forward(Math.PI / 2, conf.lat0 > 0 ? Math.PI / 2 : -Math.PI / 2, xy);
    return isNaN(xy[1]) ? 0 : xy[1];
};

ProjectionFactory.createLargeScaleProjection = function(conf) {"use strict";
    var projection, xy = [], canvasRatio = conf.canvasHeight / conf.canvasWidth;
    if (canvasRatio < conf.formatRatioLimit) {
        // landscape format
        // use cylindrical projection for latitudes close to the equator
        if (Math.abs(conf.lat0) < conf.cylindricalLowerLat) {

            projection = new LambertCylindricalEqualArea();
            // compute vertical shift for cylindrical projection
            // such that the central latitude appears in the center of the map.
            projection.forward(0, conf.lat0, xy);
            projection.setVerticalShift(-xy[1]);
            return projection;
        }
        // use azimuthal projection to show poles
        if (Math.abs(conf.lat0) > conf.polarUpperLat) {
            return ProjectionFactory.shiftedLambertAzimuthalPolar(conf);
        }
        // use conic between equator and poles
        return ProjectionFactory.largeScaleAlbersConicForLandscapeFormat(conf);
    } else if (canvasRatio > 1 / conf.formatRatioLimit) {
        // portrait format
        projection = new LambertTransverseCylindricalEqualArea();
        projection.initialize(conf);
        return projection;
    } else {
        // square format
        // FIXME: use faster polar or equatorial equations when close to poles or equator
        projection = new LambertAzimuthalEqualAreaOblique();
        projection.initialize(conf);
        return projection;
    }
};

ProjectionFactory.shiftedLambertAzimuthalPolar = function(conf) {
    var azimuthalProj = new LambertAzimuthalEqualAreaPolar();
    azimuthalProj.initialize(conf);

    // compute vertical shift of the azimuthal projection
    var conicPoleY = ProjectionFactory.verticalCoordinateOfFlattenedAlbersConicPole(conf);
    azimuthalProj.setVerticalShift(conicPoleY - conf.centerXY[1]);

    return azimuthalProj;
};

ProjectionFactory.largeScaleAlbersConicForLandscapeFormat = function(conf) {"use strict";
    var conicProj = new AlbersConicEqualArea();
    var w;

    // adjust lat1 and lat2 in conf
    var topXY = [], bottomXY = [];

    // FIXME make sure polar lines are not visible

    // use an azimuthal projection for finding the latitudes of the upper
    // and lower map border
    var azimuthalProj = new LambertAzimuthalEqualAreaOblique();
    azimuthalProj.initialize(conf);
    azimuthalProj.inverse(conf.topPt[0], conf.topPt[1], topXY);
    azimuthalProj.inverse(conf.bottomPt[0], conf.bottomPt[1], bottomXY);
    var dLat = (topXY[1] - bottomXY[1]) * CONIC_STD_PARALLELS_FRACTION;
    conf.lat1 = topXY[1] - dLat;
    conf.lat2 = bottomXY[1] + dLat;

    if (Math.abs(conf.lat0) < conf.cylindricalUpperLat) {
        // neighboring to cylindrical projection, use conic projection with
        // adjusted standard parallels to blend with cylindrical projection for the equator.
        /*
         * Snyder 1987 Map Projections - A working manual, p. 77:
         * The normal Cylindrical equal-area is the limiting form of
         * the Albers when the equator or two parallels symmetrical
         * about the equator are made standard.
         */
        var dLatTransition = conf.cylindricalUpperLat - conf.cylindricalLowerLat;
        w = (Math.abs(conf.lat0) - conf.cylindricalLowerLat) / dLatTransition;
        conf.lat1 *= w;
        conf.lat2 *= w;
        conicProj.initialize(conf);
        return conicProj;
    }

    if (Math.abs(conf.lat0) > conf.polarLowerLat) {
        // neighboring the azimuthal projection for poles, use conic projection with
        // adjusted standard parallels to blend with the azimuthal projection as
        // lat0 approaches the pole.
        /*
        * Snyder 1987 Map Projections - A working manual, p. 98:
        * If the pole is the only standard parallel, the Albers formulae
        * simplify to provide the polar aspect of the Lambert Azimuthal Equal-Area.
        */
        // adjust the latitude at which the azimuthal projection is used for polar areas,
        // ensuring that the wedge of the conic projection is not visible on the map
        w = (conf.polarUpperLat - Math.abs(conf.lat0)) / (conf.polarUpperLat - conf.polarLowerLat);
        if (conf.lat0 > 0) {
            conf.lat1 = w * conf.lat1 + (1 - w) * Math.PI / 2;
            conf.lat2 = w * conf.lat2 + (1 - w) * Math.PI / 2;
        } else {
            conf.lat1 = w * conf.lat1 - (1 - w) * Math.PI / 2;
            conf.lat2 = w * conf.lat2 - (1 - w) * Math.PI / 2;
        }
        conicProj.initialize(conf);
        return conicProj;
    }

    // use conic projection for intermediate latitudes
    conicProj.initialize(conf);
    // FIXME: test whether pole lines are visible and adjust standard parallels if needed.
    return conicProj;
};
/**
 * A polynomial version of the Robinson projection.
 * Canters, F., Decleir, H. 1989. The world in perspective – A directory of world map projections. Chichester, John Wiley and Sons: p. 143.
 */

function Robinson() {"use strict";

	this.toString = function() {
		return 'Robinson';
	};
	
	this.isEqualArea = function() {
		return false;
	};
	
	this.forward = function(lon, lat, xy) {
		var lat2 = lat * lat;
		xy[0] = lon * (0.8507 - lat2 * (0.1450 + lat2 * 0.0104));
		xy[1] = lat * (0.9642 - lat2 * (0.0013 + lat2 * 0.0129));
	};

	this.inverse = function(x, y, lonlat) {
		var MAX_Y = 2.177373642906054896455689671878, MAX_ITERATION = 50, EPS = 1e-7, yc, tol, y2, y4, f, fder, iterationCounter;

		if (y > MAX_Y) {
			yc = Math.PI / 2;
		} else if (y < -MAX_Y) {
			yc = -Math.PI / 2;
		} else {
			iterationCounter = 0;
			// compute latitude with Newton's method
			yc = y;
			do {
				if (iterationCounter > MAX_ITERATION) {
					lonlat[0] = NaN;
					lonlat[1] = NaN;
					return;
				}

				y2 = yc * yc;
				f = (yc * (0.9642 - y2 * (0.0013 + y2 * 0.0129))) - y;
				fder = 0.9642 - y2 * (0.0013 * 3 + y2 * 0.0129 * 5);
				yc -= tol = f / fder;

				iterationCounter += 1;
			} while (Math.abs(tol) > EPS);
		}

		if (yc > Math.PI / 2 || yc < -Math.PI / 2) {
			lonlat[0] = NaN;
			lonlat[1] = NaN;
			return;
		}
		lonlat[1] = yc;

		// compute longitude
		y2 = yc * yc;
		x /= 0.8507 - y2 * (0.1450 + y2 * 0.0104);
		if (x > Math.PI || x < -Math.PI) {
			lonlat[0] = NaN;
			lonlat[1] = NaN;
		} else {
			lonlat[0] = x;
		}
	};

	this.getOutline = function() {
		return GraticuleOutline.pseudoCylindricalOutline(this);
	};

	this.getShaderUniforms = function() {
		return {
			"projectionID" : this.getID(),
		};
	};

	this.getID = function() {
		return 54030;
	};

}
/**
 * Wrapper around a projection that vertically shifts projected coordinates for inverse projection.
 * @param {Object} proj
 * @param {Object} dy
 */

function ShiftedProjection(proj, dy) {"use strict";

    this.toString = function() {
        var txt = proj.toString();
        //txt += " (vertically shifted)";
        return txt;
    };

    this.isEqualArea = function() {
        return proj.isEqualArea();
    };
    
    this.forward = function(lon, lat, xy) {
    	proj.forward(lon, lat, xy);
    	// for the forward, the vertical shift is applied when drawing the map
    };

    this.inverse = function(x, y, lonlat) {
        y -= dy;
        proj.inverse(x, y, lonlat);
    };

    this.getOutline = function() {
        return proj.getOutline();
    };

    this.getShaderUniforms = function() {

        var uniforms = {};
        if (proj && proj.getShaderUniforms) {
            uniforms = proj.getShaderUniforms();
        }
        uniforms.falseNorthing = dy;
        return uniforms;
    };

    this.getFalseNorthing = function() {
        return dy;
    };

}
function Sinusoidal() {"use strict";

	this.toString = function() {
		return 'Sinusoidal (Equal Area)';
	};

	this.isEqualArea = function() {
		return true;
	};

	this.forward = function(lon, lat, xy) {
		xy[0] = lon * Math.cos(lat);
		xy[1] = lat;
	};

	this.inverse = function(x, y, lonlat) {
		var lon = x / Math.cos(y);
		if (lon > Math.PI || lon < -Math.PI) {
			lonlat[0] = NaN;
			lonlat[1] = NaN;
		} else {
			lonlat[0] = lon;
			lonlat[1] = y;
		}
	};

	this.getOutline = function() {
		return GraticuleOutline.pointedPoleOutline(this);
	};

	this.getShaderUniforms = function() {
		return {
			"projectionID" : this.getID(),
		};
	};

	this.getID = function() {
		return 54008;
	};
}
/*globals GraticuleOutline*/
function TransformedLambertAzimuthal(lonLimit, latLimit, ratio) {"use strict";

    var W_MAX = 0.999999, EPS10 = 1.e-10,

    // to avoid instable vertex shader
    MIN_N = 0.05, w, m, n, CA, CB, projName, outline, cosLat0 = 1, lat0 = 0;

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
/**
 * A wrapper around a projection that applies a spherical rotation and vertical shift.
 */
function TransformedProjection(proj, dy, poleLat, onlyInverseRotation) {"use strict";

    var sinLatPole, cosLatPole;

    sinLatPole = Math.sin(poleLat);
    cosLatPole = Math.cos(poleLat);

    this.toString = function() {
        var txt = proj.toString();
        if (poleLat !== Math.PI / 2) {
            txt += " (Pole rotated to " + formatLatitude(poleLat) + ")";
        }
        return txt;
    };

    this.isEqualArea = function() {
        return ( typeof proj.isEqualArea === 'function') ? proj.isEqualArea() : false;
    };

    function obliqueTransformation(lon, lat, res) {
        var sinLon = Math.sin(lon), cosLon = Math.cos(lon), sinLat = Math.sin(lat), cosLat = Math.cos(lat);
        var cosLat_x_cosLon = cosLat * cosLon;
        res[0] = adjlon(aatan2(cosLat * sinLon, sinLatPole * cosLat_x_cosLon + cosLatPole * sinLat));
        sinLat = sinLatPole * sinLat - cosLatPole * cosLat_x_cosLon;
        res[1] = aasin(sinLat);
    }

    function obliqueTransformationInv(lon, lat, res) {
        var sinLon = Math.sin(lon), cosLon = Math.cos(lon), sinLat = Math.sin(lat), cosLat = Math.cos(lat);
        var cosLat_x_cosLon = cosLat * cosLon;
        res[0] = aatan2(cosLat * sinLon, sinLatPole * cosLat_x_cosLon - cosLatPole * sinLat);
        res[1] = aasin(sinLatPole * sinLat + cosLatPole * cosLat_x_cosLon);
    }


    this.forward = function(lon, lat, xy) {
        if (onlyInverseRotation) {
            proj.forward(lon, lat, xy);
        } else {
            obliqueTransformation(lon, lat, xy);
            proj.forward(xy[0], xy[1], xy);
        }
    };

    this.inverse = function(x, y, lonlat) {
        // for the forward, the vertical shift is applied when drawing the map
        y -= dy;
        proj.inverse(x, y, lonlat);
        obliqueTransformationInv(lonlat[0], lonlat[1], lonlat);
    };

    this.getOutline = function() {
        return proj.getOutline();
    };

    this.getShaderUniforms = function() {

        var uniforms = null, invertedPoleLat;
        if (proj && proj.getShaderUniforms) {
            uniforms = proj.getShaderUniforms();
        } else {
            uniforms = {};
        }

        invertedPoleLat = Math.PI - poleLat;
        uniforms.sinLatPole = Math.sin(invertedPoleLat);
        uniforms.cosLatPole = Math.cos(invertedPoleLat);
        uniforms.falseNorthing = dy;
        return uniforms;
    };

    this.getFalseNorthing = function() {
        return dy;
    };

    this.getPoleLatitude = function() {
        return poleLat;
    };

}
function WeightedProjectionMix(projection1, projection2, weight1) {

    var proj1 = projection1;
    var proj2 = projection2;
    var temp_xy = [];
    var w1 = weight1;
    var w2 = 1 - w1;
    var dy1 = proj1.getFalseNorthing ? proj1.getFalseNorthing() : 0;
    var dy2 = proj2.getFalseNorthing ? proj2.getFalseNorthing() : 0;

    this.toString = function() {
        var w1Str = " (" + Math.round(w1 * 100) + "%)";
        var w2Str = " (" + Math.round(w2 * 100) + "%)";
        var name2 = projection2.toString();
        var name1 = projection1.toString();
        return name1 + w1Str + " and <br>" + name2 + w2Str;
    };

    this.isEqualArea = function() {
        return false;
    };

    this.forward = function(lon, lat, xy) {
        proj1.forward(lon, lat, xy);
        proj2.forward(lon, lat, temp_xy);
        xy[0] = xy[0] * w1 + temp_xy[0] * w2;
        xy[1] = (xy[1] + dy1) * w1 + (temp_xy[1] + dy2) * w2;
    };

    this.inverse = function(x, y, lonlat) {

        // tolerance for approximating longitude and latitude
        // less than a hundreth of a second
        var TOL = 0.000000001;

        // maximum number of loops
        var MAX_LOOP = 1000;

        var HALFPI = Math.PI * 0.5;
        var counter = 0;
        var dx, dy;
        var lon = 0;
        var lat = 0;
        var xy = [];

        do {
            // forward projection
            this.forward(lon, lat, xy);
            // horizontal difference in projected coordinates
            dx = x - xy[0];
            // add half of the horizontal difference to the longitude
            lon += dx * 0.5;

            // vertical difference in projected coordinates
            if (dy === y - xy[1]) {
                // the improvement to the latitude did not change with this iteration
                // this is the case for polar latitudes
                lat = lat > 0 ? HALFPI : -HALFPI;
                dy = 0;
            } else {
                dy = y - xy[1];
            }

            // add half of the vertical difference to the latitude
            lat += dy * 0.5;

            // to guarantee stable forward projections,
            // latitude must not go beyond +/-PI/2
            if (lat < -HALFPI) {
                lat = -HALFPI;
            }
            if (lat > HALFPI) {
                lat = HALFPI;
            }

            // stop if it is not converging
            if ((counter += 1) === MAX_LOOP) {
                lon = NaN;
                lat = NaN;
                break;
            }

            // stop when difference is small enough
        } while (dx > TOL || dx < -TOL || dy > TOL || dy < -TOL);

        if (lon > Math.PI || lon < -Math.PI || lat > Math.PI / 2 || lat < -Math.PI / 2) {
            lonlat[0] = NaN;
            lonlat[1] = NaN;
        } else {
            lonlat[0] = lon;
            lonlat[1] = lat;
        }
    };

    this.getOutline = function() {
        // don't use generic outline if one of the weights equals 1, as the outline might be impossible to
        // model with a generic outline (e.g., azimuthals require a circle)
        if (w1 === 1) {
            return proj1.getOutline();
        } 
        if (w2 === 1) {
            return proj2.getOutline();
        }
        return GraticuleOutline.genericOutline(this);
    };

    this.getShaderUniforms = function() {
        var u, uniforms, uniforms1, uniforms2;
        
        uniforms = {
            "projectionID" : -9999.0,
            "mixWeight" : w1,
            "mix1ProjectionID" : proj1.getID(),
            "mix2ProjectionID" : proj2.getID()
        };
        uniforms1 = proj1.getShaderUniforms();
        uniforms2 = proj2.getShaderUniforms();

        for (u in uniforms1) {
            if (uniforms1.hasOwnProperty(u) && !uniforms.hasOwnProperty(u)) {
                uniforms[u] = uniforms1[u];
            }
        }
        for (u in uniforms2) {
            if (uniforms2.hasOwnProperty(u) && !uniforms.hasOwnProperty(u)) {
                uniforms[u] = uniforms2[u];
            }
        }
        
        uniforms.falseNorthing = uniforms1.falseNorthing === undefined ? 0 : uniforms1.falseNorthing;
        uniforms.falseNorthing2 = uniforms2.falseNorthing === undefined ? 0 : uniforms2.falseNorthing;
        
        return uniforms;
    };
}
// ported from http://code.google.com/p/vanrijkom-flashlibs/ under LGPL v2.1

function ShpFile(binFile) {

    var src = new BinaryFileWrapper(binFile);

    this.header = new ShpHeader(src);
    this.records = [];
    while (true) {
        try {
            this.records.push(new ShpRecord(src));
        } catch (e) {
            if (e.id !== ShpError.ERROR_NODATA) {
                // FIXME
                alert(e);
            }
            break;
        }
    }
}

/**
 * The ShpType class is a place holder for the ESRI Shapefile defined
 * shape types.
 * @author Edwin van Rijkom
 *
 */
var ShpType = {

    /**
     * Unknow Shape Type (for internal use)
     */
    SHAPE_UNKNOWN : -1,
    /**
     * ESRI Shapefile Null Shape shape type.
     */
    SHAPE_NULL : 0,
    /**
     * ESRI Shapefile Point Shape shape type.
     */
    SHAPE_POINT : 1,
    /**
     * ESRI Shapefile PolyLine Shape shape type.
     */
    SHAPE_POLYLINE : 3,
    /**
     * ESRI Shapefile Polygon Shape shape type.
     */
    SHAPE_POLYGON : 5,
    /**
     * ESRI Shapefile Multipoint Shape shape type
     * (currently unsupported).
     */
    SHAPE_MULTIPOINT : 8,
    /**
     * ESRI Shapefile PointZ Shape shape type.
     */
    SHAPE_POINTZ : 11,
    /**
     * ESRI Shapefile PolylineZ Shape shape type
     * (currently unsupported).
     */
    SHAPE_POLYLINEZ : 13,
    /**
     * ESRI Shapefile PolygonZ Shape shape type
     * (currently unsupported).
     */
    SHAPE_POLYGONZ : 15,
    /**
     * ESRI Shapefile MultipointZ Shape shape type
     * (currently unsupported).
     */
    SHAPE_MULTIPOINTZ : 18,
    /**
     * ESRI Shapefile PointM Shape shape type
     */
    SHAPE_POINTM : 21,
    /**
     * ESRI Shapefile PolyLineM Shape shape type
     * (currently unsupported).
     */
    SHAPE_POLYLINEM : 23,
    /**
     * ESRI Shapefile PolygonM Shape shape type
     * (currently unsupported).
     */
    SHAPE_POLYGONM : 25,
    /**
     * ESRI Shapefile MultiPointM Shape shape type
     * (currently unsupported).
     */
    SHAPE_MULTIPOINTM : 28,
    /**
     * ESRI Shapefile MultiPatch Shape shape type
     * (currently unsupported).
     */
    SHAPE_MULTIPATCH : 31

};

/**
 * Constructor.
 * @param src
 * @return
 * @throws ShpError Not a valid shape file header
 * @throws ShpError Not a valid signature
 *
 */
function ShpHeader(src) {
    if (src.getLength() < 100)
        // FIXME
        alert("Not a valid shape file header (too small)");

    if (src.getSLong() != 9994)
        // FIXME
        alert("Not a valid signature. Expected 9994");

    // skip 5 integers;
    src.position += 5 * 4;

    // read file-length:
    this.fileLength = src.getSLong();

    // switch endian:
    src.bigEndian = false;

    // read version:
    this.version = src.getSLong();

    // read shape-type:
    this.shapeType = src.getSLong();

    // read bounds:
    this.boundsXY = {
        x : src.getDouble(),
        y : src.getDouble(),
        width : src.getDouble(),
        height : src.getDouble()
    };

    this.boundsZ = {
        x : src.getDouble(),
        y : src.getDouble()
    };

    this.boundsM = {
        x : src.getDouble(),
        y : src.getDouble()
    };
}

function ShpRecord(src) {
    var availableBytes = src.getLength() - src.position;

    if (availableBytes == 0)
        throw (new ShpError("No Data", ShpError.ERROR_NODATA));

    if (availableBytes < 8)
        throw (new ShpError("Not a valid record header (too small)"));

    src.bigEndian = true;

    this.number = src.getSLong();
    this.contentLength = src.getSLong();
    this.contentLengthBytes = this.contentLength * 2 - 4;
    src.bigEndian = false;
    var shapeOffset = src.position;
    this.shapeType = src.getSLong();

    switch(this.shapeType) {
        case ShpType.SHAPE_POINT:
            this.shape = new ShpPoint(src, this.contentLengthBytes);
            break;
        case ShpType.SHAPE_POINTZ:
            this.shape = new ShpPointZ(src, this.contentLengthBytes);
            break;
        case ShpType.SHAPE_POLYGON:
            this.shape = new ShpPolygon(src, this.contentLengthBytes);
            break;
        case ShpType.SHAPE_POLYLINE:
            this.shape = new ShpPolyline(src, this.contentLengthBytes);
            break;
        case ShpType.SHAPE_MULTIPATCH:
        case ShpType.SHAPE_MULTIPOINT:
        case ShpType.SHAPE_MULTIPOINTM:
        case ShpType.SHAPE_MULTIPOINTZ:
        case ShpType.SHAPE_POINTM:
        case ShpType.SHAPE_POLYGONM:
        case ShpType.SHAPE_POLYGONZ:
        case ShpType.SHAPE_POLYLINEZ:
        case ShpType.SHAPE_POLYLINEM:
            throw (new ShpError(this.shapeType + " Shape type is currently unsupported by this library"));
            break;
        default:
            throw (new ShpError("Encountered unknown shape type (" + this.shapeType + ")"));
            break;
    }
}

function ShpPoint(src, size) {
    this.type = ShpType.SHAPE_POINT;
    if (src) {
        if (src.getLength() - src.position < size)
            throw (new ShpError("Not a Point record (too small)"));
        this.x = (size > 0) ? src.getDouble() : NaN;
        this.y = (size > 0) ? src.getDouble() : NaN;
    }
}

function ShpPointZ(src, size) {
    this.type = ShpType.SHAPE_POINTZ;
    if (src) {
        if (src.getLength() - src.position < size)
            throw (new ShpError("Not a Point record (too small)"));
        this.x = (size > 0) ? src.getDouble() : NaN;
        this.y = (size > 0) ? src.getDouble() : NaN;
        this.z = (size > 16) ? src.getDouble() : NaN;
        this.m = (size > 24) ? src.getDouble() : NaN;
    }
}

function ShpPolygon(src, size) {
    // for want of a super()
    ShpPolyline.apply(this, [src, size]);
    this.type = ShpType.SHAPE_POLYGON;
}

// convert an array of points to an array of coordinates
function ptsToArray(points) {
    var ptArray = [];
    for (var ptID = 0, nPts = points.length; ptID < nPts; ptID += 1) {
        var pt = points[ptID];
        ptArray.push(pt.x);
        ptArray.push(pt.y);
    }
    return ptArray;
}

function ShpPolyline(src, size) {
    this.type = ShpType.SHAPE_POLYLINE;
    this.rings = [];
    if (!src) {
        return;
    }

    if (src.getLength() - src.position < size) {
        throw (new ShpError("Not a Polygon record (too small)"));
    }
    
    src.bigEndian = false;

    this.box = {
        xMin : src.getDouble(),
        yMin : src.getDouble(),
        xMax : src.getDouble(),
        yMax : src.getDouble()
    };

    var rc = src.getSLong();
    var pc = src.getSLong();

    var ringOffsets = [];
    while (rc--) {
        var ringOffset = src.getSLong();
        ringOffsets.push(ringOffset);
    }

    var points = [];
    while (pc--) {
        points.push(new ShpPoint(src, 16));
    }

    // convert points, and ringOffsets arrays to an array of rings:
    var removed = 0;
    var split;
    ringOffsets.shift();
    while (ringOffsets.length) {
        split = ringOffsets.shift();
        var ringPoints = points.splice(0, split - removed);
        this.rings.push(ptsToArray(ringPoints));
        removed = split;
    }
    this.rings.push(ptsToArray(points));
}

function ShpError(msg, id) {
    this.msg = msg;
    this.id = id;
    this.toString = function() {
        return this.msg;
    };
}

ShpError.ERROR_UNDEFINED = 0;
// a 'no data' error is thrown when the byte array runs out of data.
ShpError.ERROR_NODATA = 1;
