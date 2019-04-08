const _ = require("lodash");
const cheerio = require("cheerio");
const request = require("request-promise-native");
const tableToCsv = require("node-table-to-csv");
const fs = require("fs");

const states = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","DC","FL","GA",
  "HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA",
  "MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND",
  "OH","OK","OR","PA","PR","RI","SC","SD","TN","TX","UT",
  "VT","VA","WA","WV","WI","WY"
];

const formatUrl = (state, page) => `https://www.bacb.com/services/o.php?page=100155&by=state&state=${state}&pagenum=${page}`;
const scrape = async () => {
  let table = `
    <tr>
      <td>Name</td>
      <td>City</td>
      <td>State</td>
      <td>Country</td>
      <td>Certification</td>
      <td>Status</td>
      <td>Original Certification Date</td>
      <td>Next Recertification Date</td>
      <td>Expiration Date</td>
      <td>Meets Supervision Requirements as of</td>
      <td>Contact</td>
    </tr>
  `; // Headers for the Table we're constructing

  for (let i = 0; i < states.length; i++) {
    const options = {
      uri: formatUrl(states[i], 1),
      transform: function(body) {
        return cheerio.load(body.trim());
      }
    };

    try {
      const $ = await request(options);
      const rows = $(`table[background="images/headings/bg_dk_gr.gif"]`).find("tr");
      for (let i = 3; i < rows.length - 1; i += 2) { // Skip first 3 + last 1
        // start row
        table += "<tr>";

        const current = rows[i];
        const next = rows[i+1];
        const outerInfo = $(current).find("td");
        const innerInfo = $(next).find("td");

        for (let j = 0; j < outerInfo.length; j++) {
          const property = outerInfo[j];
          const colText = $(property).html().trim();
          if (j === 0) { // NAME
            const name$ = cheerio.load(property);
            const spans = name$('span[class="clickMe"]');
            const name = $(spans[1]).html().trim();
            table += `<td>${name}</td>`;
          } else if (1 <= j && j <= 5) { // CITY, STATE, COUNTRY, CERTIFICATION, STATUS
            table += `<td>${colText}</td>`;
          }
        }

        let innerPropertiesObject = {};
        let innerProperties = $(innerInfo).html().trim().split("<br>");
        innerProperties = innerProperties.filter(s => s.includes(":"));
        innerProperties.forEach(s => innerPropertiesObject[s.split(":")[0]] = s.split(":").slice(1).join("").trim());

        // Original Certification Date
        const ocd = innerPropertiesObject["Original Certification Date"];
        table += `<td>${ocd || ""}</td>`;

        // Next Recertification Date
        const nrd = innerPropertiesObject["Next Recertification"];
        table += `<td>${nrd || ""}</td>`;

        // Expiration Date
        const ed = innerPropertiesObject["Expiration Date"];
        table += `<td>${ed || ""}</td>`;

        // Meets Supervision Requirements as of
        let msrao = $(innerInfo).find("li").html();
        if (msrao) {
          msrao = msrao.split(":")[1];
          table += `<td>${msrao ? msrao.trim() : ""}</td>`;
        } else table += `<td></td>`;

        // Contact
        let contact = innerPropertiesObject["Contact"];
        if (contact) {
          let link = contact.match(/<a[^>]*href\s*=(?<HRef>[^>]+)>/g);
          if (!link.length) table += `<td></td>`;

          link = link[0].match(/href="([^"]*)/)[1];
          if (!link) table += `<td></td>`;

          link = link.replace("&amp;", "&");
          table += `<td>https://www.bacb.com/services/o.php${link}</td>`;
        } else table += `<td></td>`;

        // end row
        table += "</tr>";
      }

      console.log("Fetched all data for", states[i]);
    } catch (err) {
      console.log("Error", err);
    }
  }

  // table complete
  table = "<table>" + table + "</table>";

  // convert to csv & output to file
  const csv = tableToCsv(table);
  fs.writeFile("output.csv", csv, (err) => {
    if (err) throw err;
    console.log("Done!");
  });
};

scrape();
