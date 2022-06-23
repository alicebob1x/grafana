import { e2e } from '@grafana/e2e';

const dataSourceName = 'LokiBuilder';
const addDataSource = () => {
  e2e.flows.addDataSource({
    type: 'Loki',
    expectedAlertMessage:
      'Unable to fetch labels from Loki (Failed to call resource), please check the server logs for more details',
    name: dataSourceName,
    form: () => {
      e2e.components.DataSource.DataSourceHttpSettings.urlInput().type('http://loki-url:3100');
    },
  });
};

describe('Loki query builder', () => {
  beforeEach(() => {
    e2e.flows.login('admin', 'admin');

    e2e()
      .request({ url: `${e2e.env('BASE_URL')}/api/datasources/name/${dataSourceName}`, failOnStatusCode: false })
      .then((response) => {
        if (response.isOkStatusCode) {
          return;
        }
        addDataSource();
      });
  });

  it('should be able to use all modes', () => {
    e2e().intercept(/labels?/, (req) => {
      req.reply({ status: 'success', data: ['job', 'instance', 'source'] });
    });

    e2e().intercept(/series?/, (req) => {
      req.reply({ status: 'success', data: [{ instance: 'instance1' }] });
    });

    const finalQuery = 'rate({instance="instance1"} | logfmt | __error__=`` [$__interval]';

    // Go to Explore and choose Loki data source
    e2e.pages.Explore.visit();

    e2e.components.DataSourcePicker.container().should('be.visible').click();
    e2e().contains(dataSourceName).scrollIntoView().should('be.visible').click();

    // Start in builder mode, click and choose query pattern
    e2e.components.QueryBuilder.queryPatterns().click().type('Log query with parsing{enter}');
    e2e().contains('No pipeline errors').should('be.visible');
    e2e().contains('Logfmt').should('be.visible');

    // Add operation
    e2e().contains('Operations').should('be.visible').click();
    e2e().contains('Range functions').should('be.visible').click();

    e2e().contains('Rate').should('be.visible').click();

    // Check for error
    e2e().contains('You need to specify at least 1 label filter (stream selector)').should('be.visible');

    // Add labels
    e2e().get('#prometheus-dimensions-filter-item-key').should('be.visible').click().type('instance{enter}');
    e2e().get('#prometheus-dimensions-filter-item-value').should('be.visible').click().type('instance1{enter}');
    e2e().contains(finalQuery).should('be.visible');

    // Switch to code editor and type query
    for (const word of finalQuery.split(' ')) {
      e2e().contains(word).should('be.visible');
    }

    // Switch to explain mode and check if query is visible
    e2e().contains('label', 'Explain').click();
    e2e().contains(finalQuery).should('be.visible');
  });
});
