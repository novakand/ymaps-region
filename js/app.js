import { YMapsMapService } from './modules/ymaps/services/ymaps-map.service.js';
import { mapConfig as config } from './modules/ymaps/constants/map-config.constant.js';
import { mapState as state } from './modules/ymaps/constants/map-state.constant.js'
import { mapOptions as options } from './modules/ymaps/constants/map-options.constant.js';
import { YmapsGeocoderService } from './modules/ymaps/services/geocode/services/ymaps-geocoder.service.js';
import { GapiService } from './modules/sheets/services/gapi.service.js';
import { mapDevConfig } from './modules/ymaps/constants/map-dev-config.constant.js';
import { environment } from './modules/ymaps/environment/environment.js';
import { exceptionWords } from './modules/ymaps/constants/exception-words.constant.js';
import { default as objectManagerOptions } from './modules/ymaps/constants/map-object-manager-options.js';
import { default as uId } from './modules/ymaps/constants/unique-number.constants.js';
import { default as YaBalloon } from './modules/ymaps/constants/ymaps-balloon.js';
import { fitBoundsOpts } from './modules/ymaps/constants/fitbounds.constant.js';

let gapiService;
let map;
let mapService;
let objectManager;
let geocoder;
let filterCategory;
let currentSheets;
let isVisibleFeature = false;
let lengthItems = 0;
let table;

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
        geocoder = new YmapsGeocoderService({});
        objectManager = new ymaps.ObjectManager(objectManagerOptions());
        map.geoObjects.add(objectManager);
        setGeolocationBrowser();
      //  document.querySelector('#map-container').setAttribute('data-load', true);
    });
}

function getFilterFunction(categories) {
    return (obj) => {
        var content = obj.properties.sheet;
        return categories[content];
    }
}


async function updateDataSheets() {
    const data = await getSheets();
    data?.forEach((sheet) => sheet && buildRow2(sheet));
}

function getDeviceMobile() {
    return (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent));
}

function setGeolocationBrowser() {
    navigator.geolocation.getCurrentPosition(position => {
        const { latitude, longitude } = position.coords;
        (latitude && longitude) && map?.setCenter([latitude, longitude], 10);
    });
}

function onChangeFilter(event) {
    filterCategory[event.target.value] = event.target.checked;
    objectManager.setFilter(getFilterFunction(filterCategory));
    delay(100).then(() => fitBounds());
}


function onInitGap() {
    gapiService = new GapiService();
    gapiService.ready.then(async (isLoad) => {
        isLoad && buildRows();
    });
}


function getSheets() {
    return gapiService.listSheets()
        .then((sheets) => setFilter(sheets))
        .then((sheets) => sheets.map((sheet) => sheet.title))
        .catch(() => console.log(error))
}


function setFilter(sheets) {
    setSheets(sheets);
    filterCategory =
        sheets.reduce((result, sheet) => { return { ...result, [sheet.title]: isVisibleFeature, } }, {});
    return sheets;
}

function setSheets(sheets) {
    currentSheets = sheets;
    lengthItems = sheets.length;
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
                .then((collection) => {
                    objectManager?.add(collection);
                    objectManager.setFilter(getFilterFunction(filterCategory));
                });
        });
}

function buildPoints(data, isEmpty) {
    return new Promise((resolve, reject) => {

        const isCoordinates = isCoord(data);
        const isEmptyCoordinates = isEmptyCoord(data);

        if (isEmpty) {
            if (!!isCoordinates.length) {
                isCoordinates?.forEach((point) => objectManager?.add(buildPoint(point)));
                resolve(true);
            }

            !!isEmptyCoordinates?.length && geocoding(isEmptyCoordinates);
        }


    });
}

function isCheckCoordinates() {
    return (!point['Координаты']?.split(',')?.map(parseFloat)[0]);
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
            balloonContentBody: `<div>${point['Координаты']}</div>`,
        },
        options: {
            iconLayout: "default#image",
            iconImageHref: "./assets/images/marker-icon.svg",
            hideIconOnBalloonOpen: false,
            iconImageOffset: [-15, 5],
            visible: false
        }
    }
}

function geocoding(data) {
    const table = document.querySelector('#table-body-sheets');
    geocoder.geocode(data, { timeout: 1000 })
        .then((data) => {
            const { result } = data;
            updateCells(result);
            objectManager.add(result);
            fitBounds();
        })
        .progress((progress) => {
            const item = table.querySelector(`[data-id="${progress.message.properties.sheet}"]`);
            item.querySelector('#preloader').style.width = `${progress.processed}%`;
            const count = Number(item.querySelector('#countsEmpty').textContent);
            item.querySelector('#countsEmpty').textContent = count + 1;
        })
        .fail((err) => {
            console.log('error', err);
        });
}

function fitBounds() {
    map.geoObjects.getBounds() && map.setBounds(map.geoObjects.getBounds(), fitBoundsOpts);
}

async function updateCells(data) {
    const { sheet } = data;
    const features = buildCells(data?.features);
    gapiService.updateCells(
        sheet,
        [...features]
    ).then((data) => {
        if (data.status === 200) {
            const item = table.querySelector(`[data-id="${sheet}"]`);
            item.querySelector('#status-progress').textContent = 'check_circle';
        }

    });
}

function buildCells(data) {
    return data?.reduce((result, feature) => [...result,
    [3, feature.properties.rowIndex, feature.properties.addressComponent.region],
    [4, feature.properties.rowIndex, feature.properties.addressComponent.city],
    [5, feature.properties.rowIndex, feature.properties.addressComponent.street],
    [6, feature.properties.rowIndex, feature.geometry.coordinates.toString()]], []);
}

function isCoord(data) {
    return data?.allRows
        .map((point) => ({ ...point, sheet: data.sheet }))
        .filter(item => item['Координаты']);
}

function isEmptyCoord(data) {
    return data?.allRows
        .filter(item => !item['Координаты'])
        .map((point) => ({ text: test(removeWords(point['Адрес'], exceptionWords), point), properties: { ...point, sheet: data.sheet } }));
}

function test(address, point) {
    const isCity = address.includes(point['Город']);
    return isCity ? address : `${point['Город']}, ${address}`;
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

document.addEventListener('DOMContentLoaded', onInit);