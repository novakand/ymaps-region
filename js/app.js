import { YMapsMapService } from './modules/ymaps/services/ymaps-map.service.js';
import { mapConfig as config } from './modules/ymaps/constants/map-config.constant.js';
import { mapState as state } from './modules/ymaps/constants/map-state.constant.js'
import { mapOptions as options } from './modules/ymaps/constants/map-options.constant.js';
import { GapiService } from './modules/sheets/services/gapi.service.js';
import { default as objectManagerOptions } from './modules/ymaps/constants/map-object-manager-options.js';
import { default as uId } from './modules/ymaps/constants/unique-number.constants.js';
import { headerSheets } from './modules/sheets/constants/name-headers-sheet.constant.js';
import { fitBoundsOpts } from './modules/ymaps/constants/fitbounds.constant.js';
import { default as listBoxoptions } from './modules/ymaps/constants/list-box-options.constant.js';
import { default as listBoxoptionsVer } from './modules/ymaps/constants/list-box-options-version.constant.js';

let gapiService;
let map;
let mapService;
let objectManager;
let boundaries;
let isVisibleFeature = true;
let polyLabel;

async function onInit() {
    onInitYmapsAPI();
    //onInitGap();
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
        delay(1000).then(() => addPoints().then((data) => {
            setFilterCollection(data)
                .then((filter) =>
                    addFilter(Object.keys(filter)));
            onPreloader(false);
            addVersionChange();
        }));
        document.querySelector('#map').setAttribute('data-load', true);
    });
}

async function addPoints(type = 2) {
    return new Promise(async (resolve, reject) => {
        const data = await getDataPoints(type);
        objectManager?.add(data);
        resolve(data)
    })
}

async function addBoundaries(type = 2) {
    const data = await getData(type);
    boundaries = ymaps.geoQuery(data).addToMap(map);
    polyLabel = new ymaps.polylabel.create(map, boundaries);
}

function reverse(data) {
    data?.forEach((coordinates) => coordinates.reverse());
}

async function getData(type = 2) {
    const url = `./data-storage/districts${type == 1 ? '' : '2'}.json`
    const response = await fetch(url);
    const data = await response.json();
    data.features.forEach((feature) => reverse(feature.geometry.coordinates[0]));
    return data;
}

async function getDataPoints(type = 2) {
    const url = `./data-storage/data-points${type == 1 ? '' : '2'}.json`
    const response = await fetch(url);
    const data = await response.json();
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
            buildPoints({ ...data, sheet })
                .then(() => {
                    setFilter(data)
                        .then((filter) =>
                            addFilter(Object.keys(filter)));
                    delay(1000)
                        .then(() => {
                            onPreloader(false);
                            fitBounds();
                        })
                });
        });
}

function fitBounds() {
    map.geoObjects.getBounds() && map.setBounds(map.geoObjects.getBounds(), fitBoundsOpts);
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
            coordinates: point[headerSheets.coordinates]?.split(',')?.map(parseFloat)
        },
        properties: {
            ...point,
            balloonContentHeader: `<div>${point['Адрес']}</div>`,
            balloonContentBody: `<div>Избирательный округ № ${point[headerSheets.сountyNumber]}</div><div>Тип дома: ${point[headerSheets.filterCategory]} ${point[headerSheets.stateHouse] ? '(' + point[headerSheets.stateHouse] + ')' : ''}</div><div>Количество помещений (жилых/нежилых): ${point[headerSheets.numberResidentialPremises] || '-'}/${point[headerSheets.numberNonResidentialPremises] || '-'}</div><div>Этажей: ${point['Количество этажей'] || '-'}</div><div>Подъездов: ${point[headerSheets.numberEntrances] || '-'}</div><div>Координаты: ${point[headerSheets.coordinates]}</div>`,
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
        .filter(item => item[headerSheets.coordinates]);
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function setFilterCollection(data) {
    return new Promise((resolve, reject) => {
        const filter = data?.features
            .reduce((result, feature) => { return { ...result, [feature.properties[headerSheets.filterCategory]]: isVisibleFeature } }, {});
        resolve(filter)
    })
}

function setFilter(data) {
    return new Promise((resolve, reject) => {
        const filter = data?.allRows
            .reduce((result, feature) => { return { ...result, [feature[headerSheets.filterCategory]]: isVisibleFeature } }, {});
        resolve(filter)
    })
}

function addVersionChange() {
    const listBoxItems = ['ver1', 'ver2']
        .map((title) => {
            return new ymaps.control.ListBoxItem({ data: { content: title }, state: { selected: title === 'ver1' ? false : true } })
        });

    const reducer = (filters, filter) => {
        filters[filter.data.get('content')] = filter.isSelected();
        return filters;
    };

    const listBoxControl = new ymaps.control.ListBox(listBoxoptionsVer(listBoxItems, reducer));
    map.controls.add(listBoxControl, { float: 'right' });

    listBoxControl.events.add('select', (event) => {
        onPreloader(true)
        const listBoxItem = event.get('target');
        const listBoxItemUn = listBoxControl.getAll()
            .filter((item) => item.data.get('content') !== listBoxItem.data.get('content'));
        listBoxItemUn[0].state.set('selected', false);
        const type = listBoxItem.data.get('content');
        delay(100).then(() => addBoundaries(type === 'ver2' ? '' : 1));
        delay(200).then(() => addPoints(type === 'ver2' ? '' : 1).then(() => onPreloader(false)));
    });


    listBoxControl.events.add('deselect', (event) => {
        boundaries.removeFromMap(map);
        objectManager.removeAll();
        polyLabel._labelsCollection.removeAll();
    });
}

function addFilter(data) {
    const listBoxItems = data
        .map((title) => {
            return new ymaps.control.ListBoxItem({ data: { content: title }, state: { selected: true } })
        });

    const reducer = (filters, filter) => {
        filters[filter.data.get('content')] = filter.isSelected();
        return filters;
    };

    const listBoxControl = new ymaps.control.ListBox(listBoxoptions(listBoxItems, reducer));
    map.controls.add(listBoxControl, { float: 'right' });

    listBoxControl.events.add(['select', 'deselect'], (event) => {
        const listBoxItem = event.get('target');
        const filters = ymaps.util.extend({}, listBoxControl.state.get('filters'));
        filters[listBoxItem.data.get('content')] = listBoxItem.isSelected();
        listBoxControl.state.set('filters', filters);
    });

    const filterMonitor = new ymaps.Monitor(listBoxControl.state);
    filterMonitor.add('filters', (filters) => {
        objectManager.setFilter(getFilterFunction(filters));
    });
}

function getFilterFunction(categories) {
    return (geoObject) => {
        var content = geoObject.properties[headerSheets.filterCategory];
        return categories[content]
    }
}

document.addEventListener('DOMContentLoaded', onInit);