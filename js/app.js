import { YMapsMapService } from './modules/ymaps/services/ymaps-map.service.js';
import { mapConfig as config } from './modules/ymaps/constants/map-config.constant.js';
import { mapState as state } from './modules/ymaps/constants/map-state.constant.js'
import { mapOptions as options } from './modules/ymaps/constants/map-options.constant.js';
import { GapiService } from './modules/sheets/services/gapi.service.js';
import { default as objectManagerOptions } from './modules/ymaps/constants/map-object-manager-options.js';
import { default as uId } from './modules/ymaps/constants/unique-number.constants.js';

let gapiService;
let map;
let mapService;
let objectManager;
let geocoder;
let boundaries;

async function onInit() {
    onInitYmapsAPI();
    onInitGap();
}

async function onInitYmapsAPI() {
    const isMobile = getDeviceMobile();
    const mapOptions = { state, options: { ...(isMobile ? { balloonPanelMaxMapArea: Infinity, ...options } : options) }, config };
    mapService = new YMapsMapService('map', mapOptions);
    mapService.ready.then(async (yaMap) => {
        map = yaMap;
        document.querySelector('#map-container').setAttribute('data-load', true);
        objectManager = new ymaps.ObjectManager(objectManagerOptions());
        map.geoObjects.add(objectManager);
        delay(500).then(() => addBoundaries());
        document.querySelector('#map').setAttribute('data-load', true);
    });
}

async function addBoundaries() {
    const data = await getData();
    boundaries = ymaps.geoQuery(data).addToMap(map);
    new ymaps.polylabel.create(map, boundaries);
}

function reverse(data) {
    data?.forEach((coordinates) => coordinates.reverse());
}

async function getData() {
    const response = await fetch('./data-storage/districts.json?cache=1');
    const data = await response.json();
    data.features.forEach((feature) => reverse(feature.geometry.coordinates[0]));
    return data;
}

function getDeviceMobile() {
    return (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent));
}

function onPreloader(isShow) {
    const preloader = document.querySelector('.mdc-linear-progress');
    delay(1000).then(() => isShow ? preloader.style.width = '100%' : preloader.style.width = '0');
}

function onInitGap() {
    gapiService = new GapiService();
    gapiService.ready.then(async (isLoad) => {
        isLoad && buildRows();
    });
}

function getSheets() {
    return gapiService.listSheets()
        .then((sheets) => sheets.map((sheet) => sheet.title))
        .catch(() => console.log(error))
}

async function getRows(sheet) {
    return await gapiService.getRowsParams(sheet);
}

async function buildRows() {
    const data = await getSheets();
    data?.forEach((sheet) => sheet && buildRow(sheet));
}

function buildRow(sheet) {
    getRows(sheet)
        .then((data) => {
            buildPoints({ ...data, sheet }, true)
                .then((collection) => { });
            onPreloader(false);
        });
}

function buildPoints(data) {
    return new Promise((resolve, reject) => {
        const isCoordinates = isCoord(data);
        isCoordinates?.forEach((point) => objectManager?.add(buildPoint(point)));
        resolve(true);
    });
}

function buildPoint(point) {
    return {
        type: 'Feature',
        id: uId(),
        geometry: {
            type: 'Point',
            coordinates: point['Координаты']?.split(',')?.map(parseFloat)
        },
        properties: {
            ...point,
            balloonContentHeader: `<div>${point['Адрес']}</div>`,
            balloonContentBody: `<div>Избирательный округ № ${point['Номер округа']}</div><div>Тип дома: ${point['Тип дома']}</div><div>Координаты: ${point['Координаты']}</div>`,
        },
        options: {
            iconLayout: "default#image",
            iconImageHref: "./assets/images/marker-icon.svg",
            hideIconOnBalloonOpen: false,
            iconImageOffset: [-15, 5],
        }
    }
}
function isCoord(data) {
    return data?.allRows
        .map((point) => ({ ...point, sheet: data.sheet }))
        .filter(item => item['Координаты']);
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

document.addEventListener('DOMContentLoaded', onInit);