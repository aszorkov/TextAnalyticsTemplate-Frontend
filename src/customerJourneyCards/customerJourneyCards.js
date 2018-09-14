import InfoIcon from '../infoIcon/info-icon';
import * as d3 from 'd3';

if (!Object.assign) {
  Object.defineProperty(Object, 'assign', {
    enumerable: false,
    configurable: true,
    writable: true,
    value: function (target, firstSource) {
      'use strict';
      if (target === undefined || target === null) {
        throw new TypeError('Cannot convert first argument to object');
      }

      var to = Object(target);
      for (var i = 1; i < arguments.length; i++) {
        var nextSource = arguments[i];
        if (nextSource === undefined || nextSource === null) {
          continue;
        }

        var keysArray = Object.keys(Object(nextSource));
        for (var nextIndex = 0, len = keysArray.length; nextIndex < len; nextIndex++) {
          var nextKey = keysArray[nextIndex];
          var desc = Object.getOwnPropertyDescriptor(nextSource, nextKey);
          if (desc !== undefined && desc.enumerable) {
            to[nextKey] = nextSource[nextKey];
          }
        }
      }
      return to;
    }
  });
}

/**
 * This is required to fix a bug in MicrosoftAjaxWebForms.js
 * in Firefox where if window.event is not initialized, it loops stack
 * via arguments.callee.caller chain and breaks because of the
 * "use strict" mode
 */
function hackEventWithinDoPostBack() {
  var originalDoPostBack = window.WebForm_DoPostBackWithOptions;

  window.WebForm_DoPostBackWithOptions = function hackedDoPostBack() {
    if (!window.event)
      window.event = {};
    return originalDoPostBack.apply(this, arguments);
  };
}

export default class CustomerJourneyCards {
  constructor({tableContainerId, cardContainerId, drilldownId, CJ_options, translations}) {
    this.CJ_options = CJ_options;
    this.cj_table = document.getElementById(tableContainerId).querySelector('table');
    this.cardContainer = document.getElementById(cardContainerId);
    this.cardContainer.className = "cj-cards";

    const drilldownContainer = document.getElementById(drilldownId);
    this.drilldownSelect = drilldownContainer.querySelector('select');
    this.drilldownButton = drilldownContainer.querySelector('input');

    this.cj_namespace = "http://www.w3.org/2000/svg";
    this.cj_circleRadius = 55;
    this.cj_thickness = 5;

    this.canvasWidth = 169;
    this.canvasHeight = 154;

    this.translations = translations;

    this.init();
  }

  init() {
    this.getDataFromTable();
    this.createCards();
    this.addInfoText();
  }

  getDataFromTable() {
    let options = this.CJ_options[0];

    this.CJ_objectToProcess = [].reduce.call(this.cj_table.tBodies[0].children, (result, current) => {
      if (current.children[0].innerText.trim().indexOf(options.linebreakSegment) >= 0) {
        options = this.CJ_options[result.length];
        result[result.length] = Object.assign({}, options);
        result[result.length - 1].rows = [];
      } else {
        if (options.isCollapsed) {
          if (options.isSomeStatisticUsed) {
            result[result.length - 1].rows.push(current);
          } else {
            if (current.children[0].innerText.trim().indexOf(options.questionSegment) >= 0) {
              current.children[0].innerText = current.previousElementSibling.previousElementSibling.children[0].innerText.trim();
              result[result.length - 1].rows.push(current);
            }
          }
        } else {
          result[result.length - 1].rows.push(current);
        }
      }

      return result;
    }, []);
  }

  createCards() {
    this.CJ_objectToProcess.forEach(obj => {
      obj.rows.forEach((row, index) => {
        const card = this.createCard(obj, row);
        this.cardContainer.appendChild(card);
        // this.fixLongTitle(card);

        card.onclick = () => {
          if (navigator.userAgent.toLowerCase().indexOf('firefox') > -1) {
            hackEventWithinDoPostBack();
          }

          this.drilldownSelect.value = 'r:s:' + obj.questionId + (obj.isCollapsed ? '' : '*' + obj.answerIds[index]);
          this.drilldownButton.click();
        }
      });
    });

    // this.fixTitleHeight();
  }

  createCard(obj, row) {
    const cj_table_firstRow = this.cj_table.tHead.children[0];

    const card = document.createElement('article');
    card.className = 'dashboard__widget dashboard__widget--small ta-cj-card';

    const cardHeader = this.createCardHeader(row);
    card.appendChild(cardHeader);

    obj.MetricIds.forEach(metricId => {
      const metricName = cj_table_firstRow.children[metricId + 1].innerText;
      const metricValue = row.children[metricId + 1].innerText;

      if (obj.KeyMetricId === metricId) {
        const cardGauge = this.createGauge(obj, metricName, metricValue);
        card.insertBefore(cardGauge, cardHeader.nextElementSibling);
      } else {
        const cardRow = this.createCardRow(metricName, metricValue);
        card.appendChild(cardRow);
      }
    });

    return card;
  }

  createCardHeader(row) {
    let cardHeader = document.createElement('header');
    cardHeader.className = 'widget__header';

    let cardTitle = document.createElement('h3');
    cardTitle.className = 'widget__title';
    cardTitle.innerText = row.children[0].innerText;
    cardHeader.appendChild(cardTitle);

    return cardHeader;
  }

  createGauge(cj_object, metricName, metricValue) {
    const canvasWidth = this.canvasWidth;
    const canvasHeight = this.canvasHeight;

    let widgetBody = document.createElement('div');
    widgetBody.className = 'widget__body widget__body--no-scrolling';

    let kpiElement = document.createElement('div');
    kpiElement.className = 'co-st-r-widget-kpi';

    let mainContent = document.createElement('div');
    mainContent.className = 'main-metric-wrapper';

    kpiElement.appendChild(mainContent);
    widgetBody.appendChild(kpiElement);

    const vis = d3.select(mainContent)
      .append("svg")
      .attr("class", "gauge-metric")
      .attr("width", canvasWidth).attr("height", canvasHeight)
      .append("g")
      .attr("class", "comd-portal-trigger");

    this.addGaugeText(vis, metricName, metricValue, 'off');
    this.addGaugeChart(vis, cj_object, metricName, metricValue, 'off');

    return widgetBody;
  }

  addGaugeChart(container, cj_object, kpi_name, kpi_value, kpi_target) {
    const allLimits = Object.keys(cj_object.colors).reduce((result, color) => {
      return [...result, ...cj_object.colors[color]];
    }, []).sort((a, b) => a - b);

    const minValue = allLimits[0];
    const maxValue = allLimits[allLimits.length - 1];

    const canvasWidth = this.canvasWidth;
    const pi = Math.PI;

    const kpi = kpi_value;
    const target = kpi_target;

    const radiusOuter = 82;
    const radiusInner = 74;

    const arcLength = 300 * pi / 180;
    const startAngle = 0 - arcLength / 2;
    const endAngle = arcLength / 2;

    const targetArcLength = (target - minValue) * arcLength / (maxValue - minValue);
    const targetEndAngle = startAngle + targetArcLength;

    const kpiArcLength = kpi !== undefined ? (kpi - minValue) * arcLength / (maxValue - minValue) : 0;
    const kpiEndAngle = startAngle + kpiArcLength;

    const _top = radiusOuter + 1;
    const _left = canvasWidth / 2;

    let arcColor = '#dedede';
    const metricValueNumber = parseFloat(kpi_value);

    for (let color in cj_object.colors) {
      if (metricValueNumber >= cj_object.colors[color][0] && metricValueNumber <= cj_object.colors[color][1]) {
        arcColor = color;
        break;
      }
    }

    const arc = d3.arc()
      .innerRadius(radiusInner)
      .outerRadius(radiusOuter);

    const vis = container.append("g")
      .attr("class", "arcs")
      .attr("transform", "translate(" + _left + "," + _top + ")");

    vis.append("path")
      .datum({startAngle, endAngle})
      .attr("class", "arc__basis")
      .attr("d", arc);

    if (!isNaN(kpiEndAngle)) {
      vis.append("path")
        .datum({startAngle, endAngle: startAngle})
        .attr("d", arc)
        .attr("fill", arcColor).transition().duration(2000)
        .attrTween("d", tweenArc({startAngle, endAngle: kpiEndAngle}));
    }

    if (target !== 'off' && !isNaN(targetEndAngle)) {
      vis.append("path")
        .datum({startAngle: targetEndAngle - 0.015, endAngle: targetEndAngle + 0.015})
        .attr("class", "target__marker")
        .attr("d", arc);
    }

    function tweenArc(b) {
      return function (a) {
        const i = d3.interpolate(a, b);
        return function (t) {
          a.endAngle = i(t).endAngle;
          return arc(a);
        };
      }
    }
  }

  addGaugeText(container, kpi_name, kpi_value, kpi_target, formatter = "") {
    const canvasWidth = this.canvasWidth;
    const canvasHeight = this.canvasHeight;

    const _top = canvasHeight - 104;
    const _left = canvasWidth / 2;

    const vis = container.append("g");

    vis.append("text")
      .attr("transform", "translate(" + _left + "," + _top + ")")
      .attr("class", "target__text")
      .text(kpi_name);

    vis.append("text")
      .attr("transform", "translate(" + _left + "," + (_top + 42) + ")")
      .attr("class", "target__number")
      .text(isNaN(kpi_value) ? '-' : kpi_value + formatter);

    if(kpi_target !== 'off') {
      vis.append("text")
        .attr("transform", "translate(" + _left + "," + (_top + 70) + ")")
        .attr("class", "gap-to-target__text")
        .text("Gap to target");

      const gap = Number(Math.abs(kpi_value - kpi_target).toFixed(2));
      vis.append("text")
        .attr("transform", "translate(" + _left + "," + (_top + 89) + ")")
        .attr("class", "gap-to-target__number")
        .text(isNaN(gap) ? '-' : gap + formatter);
    }
  }

  createCardRow(metricName, metricValue) {
    const metricNameDiv = document.createElement('div');
    metricNameDiv.innerText = metricName;
    metricNameDiv.className = 'cj-card__metric-name';

    const metricValueDiv = document.createElement('div');
    metricValueDiv.innerText = isNaN(parseFloat(metricValue)) ? '–' : metricValue;
    metricValueDiv.className = 'cj-card__metric-value';

    const cardRow = document.createElement('div');
    cardRow.className = 'cj-card__card-row';
    cardRow.appendChild(metricNameDiv);
    cardRow.appendChild(metricValueDiv);

    return cardRow;
  }

  fixLongTitle(card) {
    const svg = card.querySelector('svg');
    const textN = svg.querySelector('.cj-card__text-name');
    const SVGRect = textN.getBBox();
    const rect = document.createElementNS(this.cj_namespace, "rect");
    //rect.classList.add('cj-card__text-background');
    //rect.className = 'cj-card__text-background';
    rect.setAttribute("class", 'cj-card__text-background');
    const textPadding = 2;
    rect.setAttribute("x", SVGRect.x - textPadding);
    rect.setAttribute("y", SVGRect.y - textPadding);
    rect.setAttribute("width", SVGRect.width + 2 * textPadding);
    rect.setAttribute("height", SVGRect.height + 2 * textPadding);
    rect.setAttribute("fill", "white");
    rect.style.display = 'none';
    svg.insertBefore(rect, textN);

    let addEllipsis = false;
    let oldText = textN.textContent;

    while (textN.getComputedTextLength() >= this.cj_circleRadius * 2 - 20) {
      addEllipsis = true;
      textN.textContent = textN.textContent.substr(0, textN.textContent.length - 1);
    }

    if (addEllipsis) {
      textN.textContent += '...';
      let newText = textN.textContent;
      textN.onmouseover = () => {
        rect.style.display = '';
        textN.textContent = oldText;

      };
      textN.onmouseout = () => {
        rect.style.display = 'none';
        textN.textContent = newText
      };
    }
  }

  fixTitleHeight() {
    const titles = [].slice.call(document.querySelectorAll('.cj-card__title'));
    const maxHeight = titles.reduce((res, cur) => cur.clientHeight > res.clientHeight ? cur : res).clientHeight;
    titles.forEach(title => title.style.height = maxHeight + 'px');
  }

  addInfoText() {
    const icon = new InfoIcon({
      container: this.cardContainer, infoText: this.translations['cj cards info text']
    });
  }
}











