
import electronicOrderAPI from '../../api/electronicOrderAPI.js';
import { getFormattedDate } from '../../helpers/dateHelpers.js';
import _ from 'lodash';
/**
 * https://vuex.vuejs.org/guide/state.html
 */
const state = {
  isExistingOrder: false,
  /** Initialized Data
   *  customersList is populated on an API call on component creation
   *  customerPresets is populated on an API call after a customer is selected
   *  processQueue is either available or not after county selection, 
   *  which is determined by an action made after county selection
   */
  customersList: [],
  customerPresets: {},
  presetsLoading: false,
  processQueue: [],
  payloadID: null,
  /**
   * Selections made from the UI will be stored here,
   * most of them are initialized to empty string because
   * that's how vue multi-select expects them and allows to 
   * show the placholder 'Select One'
   * 
   * But after selection they're usually set to objects with 
   * additional related data. 
   */
  selectedCustomer: '',
  selectedShortCode: '',
  selectedTitleOfficer: '',
  selectedState: '',
  selectedCounty: '',
  selectedTransType: '',
  selectedOrderType: '',
  selectedProcessQueue: '',
  cutOffTime: '',
  margins: {
    mt: null,
    mr: null,
    mb: null,
    ml: null
  },

  endorsementBox: {
    width: null,
    height: null
  },
  /**
   * Document table related
   */
  docTypes: [],
  orderTableRows: [
    /**
     * Intial row will NOT contain information, it will just render in the 
     * UI with empty fields, once the user updates the info, state will update 
     */
    {
      orderId: 1,
      documentID: null,
      orderNumber: null,
      documentType: null,
      documentTypeID: null,
      documentImage: null,
      esubmitFileName: null,
      helpers: null,
      notes: '',
      touched: false,
      showAttachments: false,
      rowIndex: 0,
      childRows: [],
      pageCount: 0,
      parentDocumentID: 0,
      selectedObjFromDocTypes: {}
    }
  ]
} // end State

/**
 * https://vuex.vuejs.org/guide/getters.html
 */
const getters = {
  isSpecificPresetAvail: (state) => (preset) => {
    return _.size(state.customerPresets[preset]) > 0;
  },

  titleOfficersList(state, getters) {
    if (getters.isSpecificPresetAvail('titleOfficers')) {
      return state.customerPresets.titleOfficers.map(officer => {
        return {
          ...officer,
          name: `${officer.firstName} ${officer.lastName}`
        }
      });
    }
    return [];
  },

  isStateSelected(state) {
    return _.size(state.selectedState) > 0;
  },

  isCountySelected(state) {
    return _.size(state.selectedCounty) > 0;
  },

  states(state, getters) {
    return getters.isSpecificPresetAvail('states') ? state.customerPresets.states : [];
  },

  counties(state, getters) {
    if (getters.isStateSelected && getters.isSpecificPresetAvail('counties')) {
      // Backend inconsistent data
      const stateID = state.selectedState.id || state.selectedState.stateID;
      return state.customerPresets.counties
        .filter(county => county.stateId == stateID);
    } else {
      return [];
    }
  },

  orderTypes(state, getters) {
    return getters.isSpecificPresetAvail('orderTypes') ? state.customerPresets.orderTypes : [];
  },

  transTypes(state, getters) {
    return getters.isSpecificPresetAvail('transTypes') ? state.customerPresets.transTypes : [];
  },

  hasProcessQueue(state) {
    return _.size(state.processQueue) > 0;
  },

  hasOrderTypes(state) {
    if (_.size(state.selectedCustomer) > 0) {
      return state.selectedCustomer.usesOrderType != 0;
    }
    return false;
  },

  hasTransTypes(state) {
    if (_.size(state.selectedCustomer) > 0) {
      return state.selectedCustomer.usesTransType != 0;
    }
    return false;
  },

  isOrderCreated(state) {
    return state.payloadID != null;
  },

  areRequiredFieldsSet(state, getters) {
    return (
      state.selectedCustomer &&
      state.selectedTitleOfficer &&
      getters.isStateSelected &&
      getters.isCountySelected
    )
  },

  areOptionalFieldsSet(state, getters) {
    const conditions = [getters.hasProcessQueue, getters.hasOrderTypes, getters.hasTransTypes];
    const isProcessQueueSelected = _.size(state.selectedProcessQueue) > 0;
    const isOrderTypeSelected = _.size(state.selectedOrderType) > 0;
    const isTransTypeSelected = _.size(state.selectedTransType) > 0;
    const selectedValues = [isProcessQueueSelected, isOrderTypeSelected, isTransTypeSelected];
    return _.isEqual(conditions, selectedValues);
  },

  isReadyForTable(state, getters) {
    // when there is no payloadID yet, check the fields
    if (!getters.isOrderCreated) {
      return getters.areRequiredFieldsSet && getters.areOptionalFieldsSet;
    } else {
      return true;
    }
  },

  validRows(state) {
    return _.size(state.orderTableRows.filter(row => row.documentID != null));
  },

  isReadyToSave(state) {
    return _.size(state.payloadID) > 0;
  },

  isReadyToSubmit(state, getters) {
    return getters.areParentRowsReady && getters.areChildRowsReady;
  },

  /**
   * Checking Parent rows to see if they're ready for 
   * submission, mainly if the row has a documentTypeID,
   * and if an esubmitFileName follows suit.
   *   
   */
  areParentRowsReady(state) {
    let docTypeIdCount = 0;
    let esubmitFileNameCount = 0;
    let len = state.orderTableRows.length;
    if (len > 1) {
      for (let i = 0; i < len; i++) {
        let currentRow = state.orderTableRows[i];
        if (currentRow.documentTypeID) {
          docTypeIdCount++;
        }
        if (currentRow.esubmitFileName) {
          esubmitFileNameCount++;
        }
      }
      return docTypeIdCount == esubmitFileNameCount;
    }
    return false;
  },

  areChildRowsReady(state) {
    let len = state.orderTableRows.length;
    let topRowsWithNRrequirement = 0;
    let topRowsMeetNRrequirement = 0;
    if (len > 1) {
      for (let i = 0; i < len; i++) {
        let currentRow = state.orderTableRows[i];
        /**
         * The top rows with requireNR == 2 have to have childrows with
         * uploaded docs, all of them. Check for esubmitFileName and pageCount
         */
        if (currentRow.requireNR == 2) {
          topRowsWithNRrequirement++;
          const allChildRowsHaveDocs = currentRow.childRows.every(child => child.esubmitFileName && child.pageCount);
          if (allChildRowsHaveDocs) {
            topRowsMeetNRrequirement++;
          }
        }
      }
    }

    return topRowsWithNRrequirement == topRowsMeetNRrequirement;
  },

  getSubRowDocId: (state) => ({ parentRowIndex, childRowIndex }) => {
    return state.orderTableRows[parentRowIndex].childRows[childRowIndex].documentID;
  },

  isSubRowComplete: (state) => ({ parentRowIndex, childRowIndex }) => {
    const { esubmitFileName, pageCount } = state.orderTableRows[parentRowIndex].childRows[childRowIndex];
    return !!esubmitFileName && !!pageCount;
  },

  getPageCountAndEsubmit: (state) => ({ parentRowIndex, childRowIndex }) => {
    const { esubmitFileName, pageCount } = state.orderTableRows[parentRowIndex].childRows[childRowIndex];
    return {
      esubmitFileName,
      pageCount
    }
  },

  getChildRows: (state) => (parentRowIndex) => {
    return state.orderTableRows[parentRowIndex].childRows;
  },

  getParentRowDocId: (state) => (parentRowIndex) => {
    return state.orderTableRows[parentRowIndex].documentID;
  },

  ifValidLastRow: (state) => {
    const len = state.orderTableRows.length;
    return !!state.orderTableRows[len - 1].documentID;
  },

  getESubmitDocElements: (state) => (parentRowIndex) => {
    return state.orderTableRows[parentRowIndex].existingFormData || {};
  },

  getRowsData(state) {
    let rows = [];
    let processingOrder = 1;
    const payloadID = state.payloadID;
    state.orderTableRows.forEach(row => {
      if (row.documentTypeID != null) {
        rows.push({
          ...row,
          processingOrder,
          payloadID,
          parentDocumentID: 0
        });
        processingOrder++;
      }

      if (row.childRows) {
        row.childRows.forEach(childRow => {
          if (childRow.esubmitFileName) {
            rows.push({
              ...childRow,
              processingOrder,
              payloadID
            });
            processingOrder++;
          }
        });
      }
    });
    return rows;
  },

  getElectronicData(state, getters) {
    let processQueueID = null;
    if (state.selectedProcessQueue) {
      processQueueID = state.selectedProcessQueue.entityID;
    }

    return {
      head: {
        customerId: state.selectedCustomer.id,
        titleOfficerID: state.selectedTitleOfficer.id,
        recordingDate: getFormattedDate(),
        /**
         * The states list coming from the backend sometimes has `id`
         * as the key, but other times `stateID`
         */
        state: state.selectedState.id || state.selectedState.stateID,
        countyID: state.selectedCounty.id,
        transType: state.selectedTransType.description || 'Not Used',
        processQueueID,
        orderType: state.selectedOrderType.description || 'Not Used',
        shortCode: state.selectedShortCode,
        orderNumber: state.orderTableRows[0].orderNumber,
        payloadID: state.payloadID,
        /**
         * By default, status will be 'D', cause most cases will just be 
         * saving draft, however on submission requests, the status here needs to
         * be overridden with a value of 'O' 
         */
        status: 'D'
      },

      rows: getters.getRowsData
    }
  },

  useMargins(state) {
    return _.some(state.margins);
  },

  useEndorsementBox(state) {
    return _.some(state.endorsementBox);
  },

  countyMargins(state) {
    if (state.selectedCounty) {
      const obj = state.customerPresets.counties.find(county => county.id == state.selectedCounty.id);
      return obj ? obj.margins : "";
    }
    return "";
  },

  countyEndorsementBox(state) {
    if (state.selectedCounty) {
      const obj = state.customerPresets.counties.find(county => county.id == state.selectedCounty.id);
      return obj ? obj.endorsementArea : "";
    }
    return "";
  }

} // end Getters
/**
 * https://vuex.vuejs.org/guide/actions.html
 */
const actions = {

  async fetchCustomers({ commit }) {
    try {
      const { data } = await electronicOrderAPI.getCustomers();
      commit('SET_CUSTOMERS_LIST', data);
    }
    catch (e) {
      console.error(e);
    }
  },

  async fetchCustomerPresets({ commit }, shortCode) {
    commit("SET_PRESETS_LOADING_INDICATOR", true);
    try {
      const { data } = await electronicOrderAPI.getCustomerPresets(shortCode);
      commit('SET_CUSTOMER_PRESETS', data);
      commit("SET_PRESETS_LOADING_INDICATOR", false);
    }
    catch (e) {
      console.error(e);
      commit("SET_PRESETS_LOADING_INDICATOR", false);
    }
  },

  async fetchDocTypesList({ state, commit }) {
    const countyID = state.selectedCounty.id;
    try {
      const { data } = await electronicOrderAPI.getDocTypes(countyID);
      commit('SET_DOCTYPES_LIST', data);
    }
    catch (e) {
      console.error(e);
    }
  },

  async fetchDocTypeHelpers({ commit }, payload) {
    const { documentTypeID } = payload;
    try {
      const { data } = await electronicOrderAPI.getDocTypeHelpers(documentTypeID);
      commit('SET_DOCTYPE_HELPERS', { id: documentTypeID, data });
      const obj = {
          ...payload,
          helpers: data
        }
      commit('UPDATE_ORDER_TABLE_ROW', obj)
      
    }
    catch (e) {
      console.error(e);
    }
  },

  async initOrderData({ state, commit }, rowData) {
    const recordingDate = getFormattedDate();

    const createOrderData = {
      head: {
        customerId: state.selectedCustomer.id,
        shortCode: state.selectedShortCode,
        titleOfficerID: state.selectedTitleOfficer.id,
        state: state.selectedState.id || state.selectedState.stateID,
        countyID: state.selectedCounty.id,
        transType: state.selectedTransType.description || 'Not Used',
        orderType: state.selectedOrderType.description || 'Not Used',
        processQueueID: state.selectedProcessQueue.queuename,
        orderNumber: rowData.orderNumber,
        recordingDate
      },
      rows: [rowData]
    }

    try {
      const { data } = await electronicOrderAPI.createOrder(createOrderData);
      const { payloadID } = data.head;
      const { documentID } = data.rows[0];
      const initialRowData = {
        rowIndex: 0,
        /**
         * `documentID` is what actually comes back from the backend and it
         * let's us know the row has been updated db/server side. 
         */
        documentID,
        ...rowData
      }
      // The payloadID lets us know the order has been created on the backend. 
      commit('SET_PAYLOAD_ID', payloadID);
      commit('UPDATE_ORDER_TABLE_ROW', initialRowData);
    }
    catch (e) {
      console.error(e);
    }
  },

  async addRowOrderData({ state, commit }, rowData) {
    const addDocData = {
      payloadID: state.payloadID,
      shortCode: state.selectedShortCode,
      addDocs: [{
        titleOfficerID: state.selectedTitleOfficer.id,
        transType: state.selectedTransType.description || 'Not Used',
        orderType: state.selectedOrderType.description || 'Not Used',
        countyID: state.selectedCounty.id,
        ...rowData
      }]
    }

    try {
      const { data } = await electronicOrderAPI.addDoc(addDocData);
      const { documentID } = data.docsAdded[0];
      const updatedRowData = {
        rowIndex: rowData.processingOrder - 1,
        ...rowData,
        documentID,
        touched: true
      }

      commit('UPDATE_ORDER_TABLE_ROW', updatedRowData);
    }
    catch (e) {
      console.error(e);
    }
  },

  async addSubRowData({ state, commit }, subRowData) {

    const addSubRowData = {
      payloadID: state.payloadID,
      shortCode: state.selectedShortCode,
      addDocs: [{
        titleOfficerID: state.selectedTitleOfficer.id,
        transType: state.selectedTransType.description || 'Not Used',
        orderType: state.selectedOrderType.description || 'Not Used',
        countyID: state.selectedCounty.id,
        ...subRowData
      }]
    }

    try {
      const { data } = await electronicOrderAPI.addDoc(addSubRowData);
      const { documentID } = data.docsAdded[0];
      const payload = {
        ...subRowData,
        documentID
      }
      commit('UPDATE_SUB_ROW', payload);
    }
    catch (e) {
      console.error(e);
    }
  },

  async updateRowOrderData({ state, commit }, rowData) {
    const { parentDocumentID } = rowData;

    const updateDocData = {
      shortCode: state.selectedShortCode,
      documentID: rowData.documentID,
      update: {
        esubmitFileName: rowData.esubmitFileName,
        pageCount: rowData.pageCount,
        orderNumber: rowData.orderNumber,
        documentType: rowData.documentType,
        documentTypeID: rowData.documentTypeID,
        documentID: rowData.documentID,
        parentDocumentID
      }
    }

    try {
      await electronicOrderAPI.updateDoc(updateDocData);
      if (parentDocumentID == 0) {
        commit('UPDATE_ORDER_TABLE_ROW', rowData);
      } else {
        commit('UPDATE_SUB_ROW', rowData);
      }
    }
    catch (e) {
      console.error(e);
    }
  },

  resetCustomerSelections({ commit }) {
    commit('RESET_CUSTOMER_PRESETS');
    commit('CLEAR_SELECTED_SHORT_CODE');
    commit('CLEAR_PAYLOAD_ID');
    commit('CLEAR_SELECTED_TITLE_OFFICER');
    commit('CLEAR_SELECTED_STATE');
    commit('CLEAR_SELECTED_COUNTY');
    commit('CLEAR_SELECTED_PROCESS_QUEUE');
    commit('RESET_PROCESS_QUEUE_LIST');
    commit('CLEAR_CUT_OFF_TIME');
    commit('CLEAR_SELECTED_ORDER_TYPE');
    commit('CLEAR_SELECTED_TRANS_TYPE');
  },

  selectedCustomerAction({ dispatch, commit }, customer) {
    dispatch('resetCustomerSelections');
    commit('SET_SELECTED_CUSTOMER', customer);
    commit('SET_SELECTED_SHORTCODE', customer.shortCode);
    dispatch('fetchCustomerPresets', customer.shortCode);
  },

  selectedStateAction({ commit }, selectedState) {
    commit('SET_SELECTED_STATE', selectedState);
    commit('RESET_ROW_DOCTYPES');
    commit('CLEAR_SELECTED_COUNTY');
    commit('RESET_PROCESS_QUEUE_LIST');
    commit('CLEAR_SELECTED_PROCESS_QUEUE');
    commit('CLEAR_CUT_OFF_TIME');
  },

  selectedCountyAction({ dispatch, commit, getters }, selectedCounty) {
    commit('SET_SELECTED_COUNTY', selectedCounty);
    commit('RESET_ROW_DOCTYPES');
    commit('CLEAR_SELECTED_PROCESS_QUEUE');
    dispatch("checkForProcessQueue");
    dispatch("checkForCutOffTime");
    dispatch("fetchDocTypesList");
    if (getters.countyMargins) {
      commit('SET_MARGINS', getters.countyMargins);
    } else {
      commit('RESET_MARGINS');
    }

    if (getters.countyEndorsementBox) {
      commit('SET_ENDORSEMENT_BOX', getters.countyEndorsementBox);
    } else {
      commit('RESET_ENDORSEMENT_BOX');
    }
  },

  async updateRowRemoval({ state, commit }, index) {

    const params = {
      payloadID: state.payloadID,
      shortCode: state.selectedShortCode,
      docs: [{ documentID: state.orderTableRows[index].documentID }]
    }
    commit('REMOVE_ORDER_TABLE_ROW', index);
    commit('RESET_ROW_ORDER_IDS');

    try {
      await electronicOrderAPI.removeDoc(params);
    }
    catch (e) {
      console.error(e);
    }
  },

  async deleteDocFromSubRow({ state, commit }, subRowObj) {
    const { documentID } = subRowObj;
    const params = {
      payloadID: state.payloadID,
      shortCode: state.selectedShortCode,
      docs: [{ documentID }]
    }
    commit('UPDATE_SUB_ROW', subRowObj);
    try {
      await electronicOrderAPI.removeDoc(params);
    }
    catch (e) {
      console.error(e);
    }
  },

  async cancelOrder({ state }) {
    const params = {
      payloadID: state.payloadID,
      shortCode: state.selectedShortCode
    }

    try {
      await electronicOrderAPI.cancelOrder(params);
    }
    catch (e) {
      console.error(e);
    }
  },

  checkForProcessQueue({ state, commit }) {
    const county = state.customerPresets.counties.find(county => county.id == state.selectedCounty.id);
    if (county && _.size(county.process_queues) > 0) {
      const process_queues = county.process_queues.filter(obj => obj.uiVisible == "Y");
      commit('SET_PROCESS_QUEUE', process_queues);
    } else {
      commit('RESET_PROCESS_QUEUE_LIST');
    }
  },

  checkForCutOffTime({ state, commit }) {
    const county = state.customerPresets.counties.find(county => county.id == state.selectedCounty.id);
    if (county && county.certnaCutOffTime !== null) {
      commit('SET_CUT_OFF_TIME', county.certnaCutOffTime);
    } else {
      commit('CLEAR_CUT_OFF_TIME');
    }
  },

  resetTable({ commit }) {
    commit('RESET_ORDER_TABLE_ROWS');
    commit('RESET_DOCTYPES');
  },

  resetCurrentOrder({ dispatch, commit }) {
    commit('CLEAR_SELECTED_CUSTOMER');
    dispatch('resetCustomerSelections');
    dispatch('resetTable');
  },

  async populateExistingOrder({ state, dispatch, commit }, payload) {
    const shortCode = payload[0]['customer']['shortCode'];
    const customerPresets = payload[0];
    const customer = state.customersList.find(cust => cust.shortCode == shortCode);
    commit('SET_SELECTED_SHORTCODE', shortCode);
    commit('SET_SELECTED_CUSTOMER', customer);
    commit('SET_CUSTOMER_PRESETS', customerPresets);
    let titleOfficer = payload[0]['titleOfficers'].find(officer => officer.id == payload[2][0]['titleOfficerID']);
    titleOfficer = {
      ...titleOfficer,
      name: `${titleOfficer.firstName} ${titleOfficer.lastName}`
    }

    let selectedState = payload[0].states.find(state => state.id == payload[1]['stateId']);
    // Backend returns inconsistent data, if key is not 'id' for state then it might be 'stateID'
    if (!selectedState) {
      selectedState = payload[0].states.find(state => state.stateID == payload[1]['stateId']);
    }

    const county = payload[0].counties.find(county => county.id == payload[1]['countyID']);


    if (payload[0]['orderTypes'] && payload[2][0]['orderType']) {
      let orderType = payload[0]['orderTypes'].find(obj => obj.description == payload[2][0]['orderType']);
      commit('SET_SELECTED_ORDER_TYPE', orderType);
    }

    if (payload[0]['transTypes'] && payload[2][0]['transType']) {
      let transType = payload[0]['transTypes'].find(obj => obj.description == payload[2][0]['transType']);
      commit('SET_SELECTED_TRANS_TYPE', transType);
    }

    commit('SET_SELECTED_TITLE_OFFICER', titleOfficer);
    commit('SET_SELECTED_STATE', selectedState);
    commit('SET_SELECTED_COUNTY', county);
    dispatch('fetchDocTypesList');
    dispatch('checkForProcessQueue');
    commit('SET_PAYLOAD_ID', payload[1]['payloadID']);

    let orderTableRows = payload[2]
      // Filtering for parent rows, because they will not have a parentDocumentID 
      .filter(obj => obj.parentDocumentID == 0)
      .map((obj, i) => {
        let esubmitDocElements = '';
        let existingFormData = {};
        if (obj.esubmitDocElements) {
          esubmitDocElements = obj.esubmitDocElements;
          const keyValPairs = _.split(esubmitDocElements, "||");
          const formattedPairs = [];
          for (let pair of keyValPairs) {
            if (pair) {
              let formattedPair = _.split(pair, ',');
              formattedPair[1] = _.trim(formattedPair[1]);
              formattedPair[1] = _.trimStart(formattedPair[1], '~~');
              if (_.includes(formattedPair[0], '~~')) {
                formattedPair = _.split(formattedPair, "~~");
                formattedPair[1] = _.trimEnd(formattedPair[1], ',');
              }
              formattedPairs.push(formattedPair);
            }
          }
          existingFormData = _.fromPairs(_.map(formattedPairs, pair => [String(pair[0]), String(pair[1])]));
        }

        let childRows = obj.docType.helpers.map((child, j) => {
          // The existing data payload contains child rows that match the parent
          let matchingChild = payload[2].find(plChild => plChild.parentDocumentID == obj.documentID && child.DisplayName == plChild.documentType);
          if (matchingChild) {
            return {
              childRowIndex: j,
              parentRowIndex: i,
              documentType: child.DisplayName,
              shortCode,
              documentID: matchingChild.documentID,
              esubmitFileName: matchingChild.esubmitFileName,
              parentDocumentID: matchingChild.parentDocumentID,
              pageCount: matchingChild.pageCount,
              documentTypeID: matchingChild.documentTypeID,
              orderNumber: payload[1].orderNumber
            }
          } else {
            // child without an uploaded document yet, but still needs to be avail for user to upload on Edit
            return {
              childRowIndex: j,
              parentRowIndex: i,
              documentType: child.DisplayName,
              documentTypeID: child.id,
              shortCode,
              orderNumber: payload[1].orderNumber
            }
          }
        });

        return {
          orderId: i + 1,
          rowIndex: i,
          documentID: obj.documentID,
          documentTypeID: obj.documentTypeID,
          esubmitDocElements,
          existingFormData,
          orderNumber: obj.orderNumber,
          pageCount: obj.pageCount,
          documentType: obj.documentType,
          esubmitFileName: obj.esubmitFileName,
          notes: obj.notes,
          touched: true,
          selectedObjFromDocTypes: obj.docType,
          showAttachments: false,
          childRows
        }
      });


    let dispatchList = [];
    for (let obj of orderTableRows) {
      const { rowIndex, documentTypeID } = obj;
      const promise = dispatch('fetchDocTypeHelpers', { rowIndex, documentTypeID });
      dispatchList.push(promise);
    }
    
    await Promise.all(dispatchList);

    setTimeout(() => {
      commit('UPDATE_ORDER_TABLE_ROWS', orderTableRows);
      commit('ADD_ORDER_TABLE_ROW');
      const selectedProcessQueue = state.processQueue.find(obj => obj.entityID == payload[1]['processQueueID']);
      if (_.size(selectedProcessQueue) > 0) {
        commit('SET_SELECTED_PROCESS_QUEUE', selectedProcessQueue);
      }
    }, 1000);

  }

} // end actions

/**
 * https://vuex.vuejs.org/guide/mutations.html
 * 
 */
const mutations = {

  SET_CUSTOMER_PRESETS(state, incomingData) {
    state.customerPresets = incomingData;
  },
  SET_CUSTOMERS_LIST(state, incomingData) {
    state.customersList = incomingData;
  },
  SET_SELECTED_CUSTOMER(state, customer) {
    state.selectedCustomer = customer;
  },
  SET_SELECTED_SHORTCODE(state, shortCode) {
    state.selectedShortCode = shortCode;
  },
  SET_SELECTED_TITLE_OFFICER(state, titleOfficer) {
    state.selectedTitleOfficer = titleOfficer;
  },
  SET_SELECTED_STATE(state, selectedState) {
    state.selectedState = selectedState;
  },
  SET_SELECTED_COUNTY(state, selectedCounty) {
    state.selectedCounty = selectedCounty;
  },
  SET_PROCESS_QUEUE(state, processQueue) {
    state.processQueue = processQueue;
  },
  SET_CUT_OFF_TIME(state, time) {
    state.cutOffTime = time;
  },
  SET_SELECTED_PROCESS_QUEUE(state, selectedProcessQueue) {
    state.selectedProcessQueue = selectedProcessQueue;
  },
  SET_SELECTED_TRANS_TYPE(state, selectedTransType) {
    state.selectedTransType = selectedTransType;
  },
  SET_SELECTED_ORDER_TYPE(state, selectedOrderType) {
    state.selectedOrderType = selectedOrderType;
  },
  SET_DOCTYPES_LIST(state, docTypes) {
    state.docTypes = docTypes.filter(docType => docType.isPcor == 0);
  },
  SET_DOCTYPE_HELPERS(state, helpers) {
    state.docTypes = state.docTypes.map(obj => {
      if (obj.id == helpers.id) {
        // guarantee reactivity, vue reactivity caveat
        // https://vuex.vuejs.org/guide/mutations.html
        // Vue.set(obj, 'helpers', helpers.data);

        return {
          ...obj,
          helpers: helpers.data
        };
      }
      return obj;
    });
  },
  SET_PAYLOAD_ID(state, payloadID) {
    state.payloadID = payloadID;
  },

  SET_PRESETS_LOADING_INDICATOR(state, bool) {
    state.presetsLoading = bool;
  },

  SET_IS_EXISTING_ORDER(state, bool) {
    state.isExistingOrder = bool
  },

  SET_MARGINS(state, str) {
    const margins = _.split(str, '|', 4);
    const keys = Object.keys(state.margins);
    for (let i = 0; i < 4; i++) {
      state.margins[keys[i]] = Number(margins[i]);
    }
  },

  SET_ENDORSEMENT_BOX(state, str) {
    const properties = _.split(str, '|', 2);
    state.endorsementBox.height = Number(properties[0]);
    state.endorsementBox.width = Number(properties[1]);
  },

  ADD_ORDER_TABLE_ROW(state) {
    const len = _.size(state.orderTableRows);
    const newOrderId = len + 1;

    state.orderTableRows.push({
      orderId: newOrderId,
      // orderNumber will stay the same as the first row added
      orderNumber: state.orderTableRows[0].orderNumber,
      documentID: null,
      documentType: null,
      documentTypeID: null,
      documentImage: null,
      esubmitFileName: null,
      helpers: null,
      notes: '',
      selectedObjFromDocTypes: null,
      touched: false,
      showAttachments: false,
      rowIndex: len,
      pageCount: 0,
      childRows: [],
      selectedObjFromDocTypes: {}
    });

  },
  REMOVE_ORDER_TABLE_ROW(state, index) {
    state.orderTableRows = state.orderTableRows.filter((obj, i) => i != index);
  },
  UPDATE_ORDER_TABLE_ROWS(state, newList) {
    state.orderTableRows = newList;
  },
  UPDATE_ORDER_TABLE_ROW(state, rowObj) {
    state.orderTableRows = state.orderTableRows.map((row, i) => {
      if (i == rowObj.rowIndex) return { ...row, ...rowObj }
      return row;
    });
  },

  UPDATE_SUB_ROW(state, subRowObj) {
    const { parentRowIndex, childRowIndex } = subRowObj;
    state.orderTableRows = state.orderTableRows.map((row, i) => {
      if (i == parentRowIndex) {

        const childRows = row.childRows.map((child, i) => {
          if (i == childRowIndex) {
            return { ...child, ...subRowObj }
          }
          return child;
        });

        return { ...row, childRows };
      }
      return row;
    });
  },

  ADD_SUB_ROW(state, newSubRow) {
    const { parentRowIndex, childRowIndex } = newSubRow;
    state.orderTableRows = state.orderTableRows.map((row, i) => {
      if (i == parentRowIndex) {
        let childRows = _.cloneDeep(row.childRows);
        childRows.push(newSubRow);
        return {
          ...row,
          childRows
        }
      }
      return row;
    });
  },

  UPDATE_SUB_ROW_PARENT_INDEXES(state, index) {
    state.orderTableRows = state.orderTableRows.map((row, i) => {
      if (i == index) {
        const childRows = row.childRows.map((child, i) => {
          return {
            ...child,
            parentRowIndex: index
          }
        });
        return { ...row, childRows }
      }
      return row;
    });
  },

  /**
   * 'RESET' mutations are mostly related to reseting data that was populated from an API call to it's
   * original state, (e.g., RESET_CUSTOMER_PRESETS puts it back at an empty object)
   */
  RESET_CUSTOMER_PRESETS(state) {
    state.customerPresets = {};
  },
  RESET_PROCESS_QUEUE_LIST(state) {
    state.processQueue = [];
  },
  RESET_DOCTYPES(state) {
    state.docTypes = [];
  },
  RESET_ORDER_TABLE_ROWS(state) {
    state.orderTableRows = [
      {
        orderId: 1,
        orderNumber: null,
        documentID: null,
        documentType: null,
        documentTypeID: null,
        documentImage: null,
        esubmitFileName: null,
        helpers: null,
        notes: '',
        touched: false,
        showAttachments: false,
        parentDocumentID: 0,
        pageCount: 0,
        rowIndex: 0
      }
    ]
  },

  RESET_ROW_ORDER_IDS(state) {
    state.orderTableRows = state.orderTableRows.map((obj, i) => ({ ...obj, orderId: i + 1, rowIndex: i, processingOrder: i + 1 }))
  },
  RESET_ROW_DOCTYPES(state) {
    state.orderTableRows = state.orderTableRows.map(row => {
      return {
        ...row,
        documentType: null,
        documentTypeID: null,
        showAttachments: false,
        helpers: null
      }
    });
  },

  RESET_MARGINS(state) {
    state.margins = {
      mt: null,
      mr: null,
      mb: null,
      ml: null
    }
  },

  RESET_ENDORSEMENT_BOX(state) {
    state.margins = {
      width: null,
      height: null
    }
  },
  /**
   * CLEAR Mutations, this will extend the file a bit but will help
   * in reading the mutations that go on in Vuex Dev tools. They're directly
   * related to just clearing the form input fields to empty strings, which
   * resets the vue multiselect component 
   */
  CLEAR_SELECTED_CUSTOMER(state) {
    state.selectedCustomer = '';
  },
  CLEAR_SELECTED_SHORT_CODE(state) {
    state.selectedShortCode = '';
  },
  CLEAR_SELECTED_STATE(state) {
    state.selectedState = '';
  },
  CLEAR_SELECTED_COUNTY(state) {
    state.selectedCounty = '';
  },
  CLEAR_SELECTED_PROCESS_QUEUE(state) {
    state.selectedProcessQueue = '';
  },
  CLEAR_CUT_OFF_TIME(state) {
    state.cutOffTime = '';
  },
  CLEAR_SELECTED_TITLE_OFFICER(state) {
    state.selectedTitleOfficer = '';
  },
  CLEAR_SELECTED_ORDER_TYPE(state) {
    state.selectedOrderType = '';
  },
  CLEAR_SELECTED_TRANS_TYPE(state) {
    state.selectedTransType = '';
  },
  CLEAR_PAYLOAD_ID(state) {
    state.payloadID = null;
  }
} // end mutations

export default {
  namespaced: true,
  state,
  getters,
  actions,
  mutations
}