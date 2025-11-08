document.addEventListener('DOMContentLoaded', async () => {
    const loadingIndicator = document.getElementById('loadingIndicator');
    loadingIndicator.style.display = 'block';

    try {
        // Your Cesium ion access token. Using the default token for this example.
        Cesium.Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJjZDA0NjZjNi05ZDlmLTQ5NDUtOTI5ZS05NjkyYWRiNDkwZTkiLCJpZCI6MzU4NDE4LCJpYXQiOjE3NjI2MDY2NTV9.zVeLQskbSywA8kQk1_3hAk-AAVLGup-MdPz7rfJXpjQ';

        // const terrainProvider = await Cesium.Terrain.fromWorldTerrain();

        const viewer = new Cesium.Viewer('cesiumContainer', {
            // terrainProvider: terrainProvider,
            imageryProvider: new Cesium.OpenStreetMapImageryProvider({
                url : 'https://a.tile.openstreetmap.org/'
            }),
            infoBox: false,
            selectionIndicator: false,
            shadows: true,
            shouldAnimate: true,
            timeline: false,
            animation: false,
        });

        viewer.scene.globe.enableLighting = true;

        const listener = viewer.scene.globe.tileLoadProgressEvent.addEventListener(function(queueLength) {
            if (queueLength === 0) {
                loadingIndicator.style.display = 'none';
                listener(); // Remove the listener once loading is complete
            }
        });

        let points = [];
        let pointEntities = [];
        let animatedLines = [];

        const resetButton = document.getElementById('resetButton');
        const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

        handler.setInputAction((event) => {
            if (points.length < 2) {
                const cartesian = viewer.camera.pickEllipsoid(event.position, viewer.scene.globe.ellipsoid);
                if (cartesian) {
                    points.push(cartesian);
                    const pointEntity = viewer.entities.add({
                        position: cartesian,
                        point: {
                            pixelSize: 10,
                            color: Cesium.Color.WHITE,
                            outlineColor: Cesium.Color.BLACK,
                            outlineWidth: 2
                        }
                    });
                    pointEntities.push(pointEntity);

                    if (points.length === 2) {
                        const midpoint = calculateMidpoint(points[0], points[1]);
                        const midpointEntity = viewer.entities.add({
                            position: midpoint,
                            point: {
                                pixelSize: 12,
                                color: Cesium.Color.GOLD,
                                outlineColor: Cesium.Color.BLACK,
                                outlineWidth: 2
                            }
                        });
                        pointEntities.push(midpointEntity);

                        animateLine(points[0], midpoint, 0, viewer);
                        animateLine(points[1], midpoint, 1, viewer);
                    }
                }
            }
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

        resetButton.addEventListener('click', () => {
            points = [];
            pointEntities.forEach(entity => viewer.entities.remove(entity));
            pointEntities = [];
            animatedLines.forEach(entity => viewer.entities.remove(entity));
            animatedLines = [];
        });

        function calculateMidpoint(cartesian1, cartesian2) {
            const carto1 = Cesium.Cartographic.fromCartesian(cartesian1);
            const carto2 = Cesium.Cartographic.fromCartesian(cartesian2);

            const lon1 = carto1.longitude;
            const lat1 = carto1.latitude;
            const lon2 = carto2.longitude;
            const lat2 = carto2.latitude;

            const Bx = Math.cos(lat2) * Math.cos(lon2 - lon1);
            const By = Math.cos(lat2) * Math.sin(lon2 - lon1);

            const latMid = Math.atan2(Math.sin(lat1) + Math.sin(lat2), Math.sqrt((Math.cos(lat1) + Bx) * (Math.cos(lat1) + Bx) + By * By));
            const lonMid = lon1 + Math.atan2(By, Math.cos(lat1) + Bx);

            return Cesium.Cartesian3.fromRadians(lonMid, latMid);
        }

        function animateLine(startPoint, endPoint, index, viewer) {
            const duration = 2000; // 2 seconds
            const startTime = Cesium.JulianDate.now();

            const lineEntity = viewer.entities.add({
                polyline: {
                    positions: new Cesium.CallbackProperty(() => {
                        const elapsedTime = Cesium.JulianDate.secondsDifference(Cesium.JulianDate.now(), startTime);
                        const t = Math.min(elapsedTime / (duration / 1000), 1.0);
                        
                        const currentPos = Cesium.Cartesian3.lerp(startPoint, endPoint, t, new Cesium.Cartesian3());
                        return [startPoint, currentPos];
                    }, false),
                    width: 3,
                    material: Cesium.Color.RED,
                    clampToGround: true
                }
            });
            animatedLines[index] = lineEntity;
        }
    } catch (error) {
        console.error('Failed to initialize Cesium:', error);
        loadingIndicator.style.display = 'none';
    }
});

