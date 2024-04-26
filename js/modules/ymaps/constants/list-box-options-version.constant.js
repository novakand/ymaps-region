export default function (listBoxItems, reducer) {
    const listBoxoptionsVer =
    {
        data: {
            content: 'Версия',
            title: 'Версия (версия)'
        },
        items: listBoxItems,
        options: {checkbox:true},
        state: {
            expanded: true,
            filters: listBoxItems.reduce(reducer, {})
        }
    }

    return listBoxoptionsVer;
}