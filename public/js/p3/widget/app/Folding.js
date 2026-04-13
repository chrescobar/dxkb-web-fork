define([
    'dojo/_base/declare', 'dojo/_base/lang', 'dojo/_base/Deferred',
    'dojo/on', 'dojo/query', 'dojo/dom-class', 'dojo/dom-construct', 'dojo/dom-style', 'dojo/topic',
    './AppBase',
    'dojo/text!./templates/Folding.html', 'dijit/form/Form',
    '../../util/PathJoin', '../../WorkspaceManager', '../WorkspaceObjectSelector', '../../DataAPI'
  ], function (
    declare, lang, Deferred,
    on, query, domClass, domConstruct, domStyle, Topic,
    AppBase,
    Template, FormMixin, PathJoin, WorkspaceManager, WorkspaceObjectSelector, DataAPI
  ) {

    return declare([AppBase], {
      baseClass: 'Folding',
      templateString: Template,
      applicationName: 'PredictStructure',
      requireAuth: true,
      applicationLabel: 'Protein Structure Prediction',
      applicationDescription: 'Predict protein structures using Boltz-2, Chai-1, AlphaFold 2, or ESMFold. Provides a unified interface with automatic parameter mapping, format conversion, output normalization, and confidence scoring.',
      applicationHelp: 'quick_references/services/folding.html',
      tutorialLink: 'tutorial/folding/folding.html',
      videoLink: 'https://youtu.be/PJ9vdCnozMg',
      pageTitle: 'Protein Structure Prediction Service | BV-BRC',
      defaultPath: '',

    constructor: function () {
      this.paramToAttachPt = [
        'output_path', 'output_file', 'input_file', 'fasta_data',
        'toolAuto', 'toolBoltz', 'toolChai', 'toolAlphaFold', 'toolESMFold',
        'inputSourceFile', 'inputSourcePaste', 'inputSourceYaml',
        'num_samples', 'num_recycles', 'sampling_steps', 'seed', 'output_format',
        'msa_file', 'msa_server_url',
        'msaRadioNone', 'msaRadioServer', 'msaRadioUpload',
        'use_potentials',
        'af2_model_preset', 'af2_db_preset', 'af2_max_template_date',
        'chunk_size', 'fp16', 'max_tokens_per_batch'
      ];
      this.currentTool = 'auto';
      this.inputSource = 'file';
      this.msaMode = 'none';
    },

      startup: function () {
        if (this._started) { return; }
        if (this.requireAuth && (window.App.authorizationToken === null || window.App.authorizationToken === undefined)) {
          return;
        }
        this.inherited(arguments);

        if (window.App.user) {
          this.defaultPath = WorkspaceManager.getDefaultFolder() || this.activeWorkspacePath;
          this.output_path.set('value', this.defaultPath);
        }

        // Initialize tool selection
        this.toolAuto.set('checked', true);
        this.onToolChange();

        // Set initial required states for input sources (file is default)
        this.fasta_data.set('required', false);
        this.boltz_yaml_data.set('required', false);

        this.form_flag = false;
        try {
          this.intakeRerunForm();
          if (this.form_flag) {
            this.output_file.focus();
          }
        } catch (error) {
          console.error(error);
        }

        this._started = true;
      },

      openJobsList: function () {
        Topic.publish('/navigate', { href: '/job/' });
      },

      _getSelectedTool: function () {
        if (this.toolBoltz.get('checked')) { return 'boltz'; }
        if (this.toolChai.get('checked')) { return 'chai'; }
        if (this.toolAlphaFold.get('checked')) { return 'alphafold'; }
        if (this.toolESMFold.get('checked')) { return 'esmfold'; }
        return 'auto';
      },

      onToolChange: function () {
        this.currentTool = this._getSelectedTool();

        // Hide all tool-specific parameter boxes
        this.boltzParamsBox.style.display = 'none';
        this.alphafoldParamsBox.style.display = 'none';
        this.esmfoldParamsBox.style.display = 'none';

        // Show the relevant tool-specific parameter box
        if (this.currentTool === 'boltz') {
          this.boltzParamsBox.style.display = 'block';
          this.boltzYamlOptionWrapper.style.display = '';
        } else {
          this.boltzYamlOptionWrapper.style.display = 'none';
          // If Boltz YAML was selected, fall back to file input
          if (this.inputSource === 'yaml_data') {
            this.inputSource = 'file';
            this.inputSourceFile.set('checked', true);
            this.inputFileRow.style.display = 'block';
            this.pasteSequenceRow.style.display = 'none';
            this.boltzYamlRow.style.display = 'none';
            this.input_file.set('required', true);
            this.boltz_yaml_data.set('required', false);
          }
        }
        if (this.currentTool === 'alphafold') {
          this.alphafoldParamsBox.style.display = 'block';
        } else if (this.currentTool === 'esmfold') {
          this.esmfoldParamsBox.style.display = 'block';
        }

        // MSA Parameters are not applicable to ESMFold
        this.msaParamsBox.style.display = this.currentTool === 'esmfold' ? 'none' : 'block';

        this.validate();
      },

      onInputSourceChange: function () {
        if (this.inputSourcePaste.get('checked')) {
          this.inputSource = 'paste';
        } else if (this.inputSourceYaml.get('checked')) {
          this.inputSource = 'yaml_data';
        } else {
          this.inputSource = 'file';
        }
        this.inputFileRow.style.display = this.inputSource === 'file' ? 'block' : 'none';
        this.pasteSequenceRow.style.display = this.inputSource === 'paste' ? 'block' : 'none';
        this.boltzYamlRow.style.display = this.inputSource === 'yaml_data' ? 'block' : 'none';

        this.input_file.set('required', this.inputSource === 'file');
        this.fasta_data.set('required', this.inputSource === 'paste');
        this.boltz_yaml_data.set('required', this.inputSource === 'yaml_data');

        this.validate();
      },

      toggleAdvancedParams: function () {
        var isOpen = this.advancedParamsContent.style.display !== 'none';
        this.advancedParamsContent.style.display = isOpen ? 'none' : 'block';
        this.advancedParamsArrow.textContent = isOpen ? '\u25BC' : '\u25B2';
      },

      _setMsaMode: function (mode) {
        this.msaMode = mode;
        this.msaContentNone.style.display = mode === 'none' ? 'block' : 'none';
        this.msaContentServer.style.display = mode === 'server' ? 'block' : 'none';
        this.msaContentUpload.style.display = mode === 'upload' ? 'block' : 'none';
        this.validate();
      },

      onMsaModeChange: function () {
        if (this.msaRadioServer.get('checked')) { this._setMsaMode('server'); }
        else if (this.msaRadioUpload.get('checked')) { this._setMsaMode('upload'); }
        else { this._setMsaMode('none'); }
      },

      validate: function () {
        var valid = this.inherited(arguments);
        if (valid) {
          var val = true;

          if (!this.output_path.get('value')) {
            val = false;
          }

          if (!this.output_file.get('value')) {
            val = false;
          }

          if (this.inputSource === 'yaml_data') {
            if (!this.boltz_yaml_data.get('value')) { val = false; }
          } else if (this.inputSource === 'paste') {
            if (!this.fasta_data.get('value')) { val = false; }
          } else {
            if (!this.input_file.get('value')) { val = false; }
          }

          if (val) {
            this.submitButton.set('disabled', false);
            return true;
          }
        }
        this.submitButton.set('disabled', true);
        return false;
      },

      onOutputPathChange: function (val) {
        this.inherited(arguments);
        this.validate();
      },

      checkOutputName: function () {
        this.inherited(arguments);
        this.validate();
      },

      getValues: function () {
        var values = this.inherited(arguments);
        var folding_values = {};

        // Required parameters
        folding_values.tool = this.currentTool;
        if (this.inputSource === 'yaml_data') {
          folding_values.boltz_yaml_data = this.boltz_yaml_data.get('value');
        } else if (this.inputSource === 'paste') {
          folding_values.fasta_data = this.fasta_data.get('value');
        } else {
          folding_values.input_file = values.input_file;
        }
        folding_values.output_path = values.output_path;
        folding_values.output_file = values.output_file;

        // Common optional parameters
        folding_values.num_samples = values.num_samples;
        folding_values.num_recycles = values.num_recycles;
        folding_values.output_format = values.output_format;
        folding_values.seed = values.seed;

        // MSA parameters
        folding_values.msa_mode = this.msaMode;
        if (this.msaMode === 'server') {
          if (values.msa_server_url) { folding_values.msa_server_url = values.msa_server_url; }
        } else if (this.msaMode === 'upload' && values.msa_file) {
          folding_values.msa_file = values.msa_file;
        }

        // Tool-specific pass-through parameters
        if (this.currentTool === 'boltz') {
          folding_values.use_potentials = Array.isArray(values.use_potentials) ? values.use_potentials.length > 0 : Boolean(values.use_potentials);
        } else if (this.currentTool === 'alphafold') {
          folding_values.af2_model_preset = values.af2_model_preset;
          folding_values.af2_db_preset = values.af2_db_preset;
          if (values.af2_max_template_date) {
            folding_values.af2_max_template_date = values.af2_max_template_date;
          }
        } else if (this.currentTool === 'esmfold') {
          if (values.chunk_size) { folding_values.chunk_size = values.chunk_size; }
          folding_values.fp16 = Array.isArray(values.fp16) ? values.fp16.length > 0 : Boolean(values.fp16);
          if (values.max_tokens_per_batch) { folding_values.max_tokens_per_batch = values.max_tokens_per_batch; }
        }

        // Advanced parameters
        if (values.sampling_steps) {
          folding_values.sampling_steps = values.sampling_steps;
        }

        return folding_values;
      },

      onReset: function (evt) {
        this.inherited(arguments);
      },

      addRerunFields: function (job_params) {
        // Set tool via radio buttons
        if (job_params.tool) {
          this.toolAuto.set('checked', job_params.tool === 'auto');
          this.toolBoltz.set('checked', job_params.tool === 'boltz');
          this.toolChai.set('checked', job_params.tool === 'chai');
          this.toolAlphaFold.set('checked', job_params.tool === 'alphafold');
          this.toolESMFold.set('checked', job_params.tool === 'esmfold');
          this.onToolChange();
        }

        // Common fields
        if (job_params.output_path) {
          this.output_path.set('value', job_params.output_path);
        }
        if (job_params.output_file) {
          this.output_file.set('value', job_params.output_file);
        }
        if (job_params.boltz_yaml_data) {
          this.inputSourceYaml.set('checked', true);
          this.onInputSourceChange();
          this.boltz_yaml_data.set('value', job_params.boltz_yaml_data);
        } else if (job_params.fasta_data) {
          this.inputSourcePaste.set('checked', true);
          this.onInputSourceChange();
          this.fasta_data.set('value', job_params.fasta_data);
        } else if (job_params.input_file) {
          this.input_file.set('value', job_params.input_file);
        }

        // Common optional parameters
        if (job_params.num_samples !== undefined) {
          this.num_samples.set('value', job_params.num_samples);
        }
        if (job_params.num_recycles !== undefined) {
          this.num_recycles.set('value', job_params.num_recycles);
        }
        if (job_params.sampling_steps !== undefined) {
          this.sampling_steps.set('value', job_params.sampling_steps);
        }
        if (job_params.seed !== undefined) {
          this.seed.set('value', job_params.seed);
        }
        if (job_params.output_format) {
          this.output_format.set('value', job_params.output_format);
        }

        // MSA parameters
        if (job_params.msa_mode === 'server') {
          this.msaRadioServer.set('checked', true);
          this._setMsaMode('server');
          if (job_params.msa_server_url) { this.msa_server_url.set('value', job_params.msa_server_url); }
        } else if (job_params.msa_mode === 'upload' || job_params.msa_file) {
          this.msaRadioUpload.set('checked', true);
          this._setMsaMode('upload');
          if (job_params.msa_file) { this.msa_file.set('value', job_params.msa_file); }
        } else {
          this.msaRadioNone.set('checked', true);
          this._setMsaMode('none');
        }

        // Boltz-specific
        if (job_params.use_potentials !== undefined) {
          this.use_potentials.set('checked', Boolean(job_params.use_potentials));
        }

        // AlphaFold-specific
        if (job_params.af2_model_preset) {
          this.af2_model_preset.set('value', job_params.af2_model_preset);
        }
        if (job_params.af2_db_preset) {
          this.af2_db_preset.set('value', job_params.af2_db_preset);
        }
        if (job_params.af2_max_template_date) {
          this.af2_max_template_date.set('value', job_params.af2_max_template_date);
        }

        // ESMFold-specific
        if (job_params.chunk_size !== undefined) {
          this.chunk_size.set('value', job_params.chunk_size);
        }
        if (job_params.fp16 !== undefined) {
          this.fp16.set('checked', Boolean(job_params.fp16));
        }
        if (job_params.max_tokens_per_batch !== undefined) {
          this.max_tokens_per_batch.set('value', job_params.max_tokens_per_batch);
        }
      },

      intakeRerunForm: function () {
        var service_fields = window.location.search.replace('?', '');
        var rerun_fields = service_fields.split('=');
        var rerun_key;

        if (rerun_fields.length > 1) {
          try {
            rerun_key = rerun_fields[1];
            var sessionStorage = window.sessionStorage;
            if (sessionStorage.hasOwnProperty(rerun_key)) {
              var param_dict = { 'output_folder': 'output_path' };
              AppBase.prototype.intakeRerunFormBase.call(this, param_dict);
              this.addRerunFields(JSON.parse(sessionStorage.getItem(rerun_key)));
              this.form_flag = true;
            }
          } catch (error) {
            console.log('Error during intakeRerunForm: ', error);
          } finally {
            if (rerun_key) {
              sessionStorage.removeItem(rerun_key);
            }
          }
        }
      }
    });
  });
