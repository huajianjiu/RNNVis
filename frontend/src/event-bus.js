import Vue from 'vue';
import dataService from './services/dataService';
import { CoClusterProcessor, SentenceRecord, StateStatistics } from './preprocess'

// event definitions goes here
const SELECT_MODEL = 'SELECT_MODEL';
const SELECT_STATE = 'SELECT_STATE';
const CHANGE_LAYOUT = 'CHANGE_LAYOUT';
const EVALUATE_SENTENCE = 'EVALUATE_SENTENCE';
const SELECT_UNIT = 'SELECT_UNIT';
const SELECT_WORD = 'SELECT_WORD';
const SELECT_LAYER = 'SELECT_LAYER';

const state = {
  selectedModel: null,
  selectedState: null,
  selectedLayer: null,
  modelConfigs: {},
  coClusters: {},
  availableModels: null,
  sentenceRecords: {},
  statistics: {},
  modelsSet: null,
};

const bus = new Vue({
  data: {
    state: state,
    cell2states: {
      'GRU': ['state'],
      'BasicLSTM': ['state_c', 'state_h'],
      'BasicRNN': ['state'],
    },
  },
  computed: {
  },
  methods: {

    loadModelConfig(modelName) { // return a Promise
      if (!modelName)
        return Promise.reject(modelName);
      if (!Object.prototype.hasOwnProperty.call(state.modelConfigs, modelName)) {
        return dataService.getModelConfig(modelName, response => {
          if (response.status === 200) {
            state.modelConfigs[modelName] = response.data;
            // state.selectedModel = modelName;
          }
        });
      }
      return Promise.resolve(modelName);
    },

    loadAvailableModels() {
      // console.log(this.availableModels);
      if (this.state.availableModels === null) {
        return dataService.getModels(response => {
          if (response.status === 200) {
            const data = response.data;
            this.state.availableModels = data.models;
            this.state.modelsSet = new Set(this.state.availableModels);
            // console.log(this.state.modelsSet);
          } else throw response;
        });
      }
      return Promise.resolve('Already Loaded');
    },
    loadCoCluster(modelName = this.state.selectedModel, stateName = this.state.selectedState, nCluster = 10, params = { top_k: 300, mode: 'positive' }) {
      const coCluster = new CoClusterProcessor(modelName, stateName, nCluster, params);
      const coClusterName = CoClusterProcessor.identifier(coCluster);
      if (this.state.coClusters.hasOwnProperty(coClusterName))
        return Promise.resolve('Cocluster data already loaded');
      return this.loadAvailableModels()
        .then(() => {
          if (this.state.modelsSet.has(modelName)) {
            return coCluster.load();
          }
          throw `No model named ${modelName}`;
        })
        .then(() => {
          this.state.coClusters[coClusterName] = coCluster;
          return 'Succeed';
        });
    },
    getCoCluster(modelName = this.state.selectedModel, stateName = this.state.selectedState, nCluster = 10, params = { top_k: 300, mode: 'positive' }) {
      const coCluster = new CoClusterProcessor(modelName, stateName, nCluster, params);
      const coClusterName = CoClusterProcessor.identifier(coCluster);
      if (this.state.coClusters.hasOwnProperty(coClusterName))
        return this.state.coClusters[coClusterName];
      console.log('First call loadCoCluster(...) to load remote Data!');
      return undefined;
    },
    // getModelConfig(modelName = state.selectedModel) {
    //   if (this.state.availableModels)
    //     return this.state.availableModels[modelName];
    //   return undefined;
    // },
    modelCellType(modelName = state.selectedModel) {
      if (Object.prototype.hasOwnProperty.call(this.state.modelConfigs, modelName)) {
        const config = this.state.modelConfigs[modelName];
        return config.model.cell_type;
      }
      return undefined;
    },
    availableStates(modelName = this.state.selectedModel) { // helper function that returns available states of the current selected Model`
      // modelName = modelName || this.state.selectedModel;
      if (Object.prototype.hasOwnProperty.call(this.state.modelConfigs, modelName)) {
        const config = this.state.modelConfigs[modelName];
        return this.cell2states[config.model.cell_type];
      }
      return undefined;
    },
    layerNum(modelName = this.selectedModel) {
      // modelName = modelName || this.state.selectedModel;
      if (Object.prototype.hasOwnProperty.call(this.state.modelConfigs, modelName)) {
        const config = this.state.modelConfigs[modelName];
        return config.model.cells.length;
      }
      return undefined;
    },
    layerSize(modelName = this.state.selectedModel, layer = -1) {
      // modelName = modelName || this.state.selectedModel;
      if (Object.prototype.hasOwnProperty.call(this.state.modelConfigs, modelName)) {
        if (layer === -1) {
          layer = this.layerNum(modelName) - 1;
        }
        const config = this.state.modelConfigs[modelName];
        return config.model.cells[layer].num_units;
      }
      return undefined;
    },
    evalSentence(sentence, modelName = state.selectedModel) {
      if (!state.sentenceRecords.hasOwnProperty(modelName)) {
        state.sentenceRecords[modelName] = [];
      }
      const record = new SentenceRecord(sentence, modelName);
      state.sentenceRecords[modelName].push(record);
      return record;
    },
    loadStatistics(modelName = state.selectedModel, stateName = state.selectedState, layer = -1, top_k = 300) {
      if (!state.statistics.hasOwnProperty(modelName)) {
        state.statistics[modelName] = {};
      }
      if(!state.statistics[modelName].hasOwnProperty(stateName)) {
        state.statistics[modelName][stateName] = [];
      }
      if (layer === -1) {
        layer = this.layerNum(modelName) - 1;
      }
      if (state.statistics[modelName][stateName][layer]){
        return Promise.resolve('Already Loaded');
      }
      const stat = new StateStatistics(modelName, stateName, layer, top_k);
      state.statistics[modelName][stateName][layer] = stat;
      return stat.load();
    },
    getStatistics(modelName = state.selectedModel, stateName = state.selectedState, layer = -1, top_k = 300) {
      if (state.statistics.hasOwnProperty(modelName)) {
        if(state.statistics[modelName].hasOwnProperty(stateName)){
          if(state.statistics[modelName][stateName][layer])
            return state.statistics[modelName][stateName][layer];
        }
      }
      console.log(`bus > unable to get statistics for ${modelName}, ${stateName}, ${layer}`);
      return undefined;
    }
  },
  created() {
    // register event listener
    this.$on(SELECT_MODEL, (modelName, compare) => {
      if (compare)
        bus.state.selectedModel2 = modelName;
      else
        bus.state.selectedModel = modelName;
    });

    this.$on(SELECT_STATE, (stateName, compare) => {
      if (compare)
        bus.state.selectedState2 = stateName;
      else
        bus.state.selectedState = stateName;
    });

    this.$on(SELECT_LAYER, (layer, compare) => {
      if (compare)
        bus.state.selectedLayer2 = layer;
      else
        bus.state.selectedLayer = layer;
    });

    this.$on(CHANGE_LAYOUT, (newLayout, compare) => {
      // if(compare)
      //   return;
      console.log(`bus > clusterNum: ${newLayout.clusterNum}`);
    });

    this.$on(EVALUATE_SENTENCE, (sentence, compare) => {
      console.log(`bus > evaluating model ${compare ? state.selectedModel2 : state.selectedModel} on sentence "${sentence}"`);
    });

    this.$on(SELECT_UNIT, (unitDims, compare) => {
      console.log(`bus > selected ${unitDims.length} units`);
    });

    this.$on(SELECT_WORD, (words, compare) => {
      console.log(`bus > selected ${words.length} word(s): ${words}`);
    });
  }
});

export default bus;

export {
  bus,
  SELECT_MODEL,
  SELECT_STATE,
  CHANGE_LAYOUT,
  EVALUATE_SENTENCE,
  CoClusterProcessor,
  SentenceRecord,
  SELECT_UNIT,
  SELECT_WORD,
  SELECT_LAYER,
}
