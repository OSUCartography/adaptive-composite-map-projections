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