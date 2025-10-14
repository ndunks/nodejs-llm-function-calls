
function getMaxpointData(page = 1) {
    return fetch(`https://maxpoint.maxsol.id/?page=${page}`)
        .then(res => res.text())
        .then(html => {
            const regex = /<h5[^>]+>(?<NAME>[^<]*)<\/h5>\s+<i[^>]*>(?<DATE>[\d \-:]+)<\/i>[\s\S]*?<div class="card-text">\s+<p>\s+(?<BODY>[\s\S]*?)\s+<\/p>\s+<\/div>/g;
            const results = html.matchAll(regex);
            const items: {
                name: string,
                /**  2025-10-14 02:39:17 */
                date: string,
                body: string
            }[] = []

            if (results) {
                for (const match of results) {
                    const name = match.groups.NAME;
                    const date = match.groups.DATE;
                    const body = match.groups.BODY?.replaceAll('<br />', "\n").replaceAll(/\n+/g, '\n');
                    // console.log(name, date, body); // { name: "NAME", date: "DATE", body: "BODY" }
                    items.push({ name, date, body })
                }
            }
            return items
        })
}

const res = await getMaxpointData(1)
console.log(res)
