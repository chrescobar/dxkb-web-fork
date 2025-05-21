define([
    'dojo/_base/declare',
    'dijit/form/Button',
    'dojo/dom-class',
    'dojo/on',
    'dojo/topic',
    'dijit/Dialog',
    'dijit/layout/ContentPane',
    'dojo/dom-construct',
    'dojo/_base/lang',
    '../copilot/ChatSessionControllerPanel',
    'dijit/TooltipDialog',
    'dijit/popup',
    'dojo/dom-style',
    './CopilotApi',
    './ChatSessionOptionsBar',
    '../copilot/CopilotGridContainer',
    'require'
], function(
    declare,
    Button,
    domClass,
    on,
    Topic,
    Dialog,
    ContentPane,
    domConstruct,
    lang,
    ChatSessionControllerPanel,
    TooltipDialog,
    popup,
    domStyle,
    CopilotAPI,
    ChatSessionOptionsBar,
    CopilotGridContainer,
    require
) {
    // Static instance variable at module scope
    var instance = null;

    // Static getInstance function at module scope
    function getInstance(opts) {
        if (!instance) {
            instance = new ChatButton(opts);
        }
        return instance;
    }

    var ChatButton = declare([Button], {
        // Base class for styling
        baseClass: 'ChatButton',

        // Dialog reference
        optionsDialog: null,

        // Controller panel reference
        controllerPanel: null,

        // Dialog reference for larger view
        largeViewDialog: null,

        // Copilot API reference
        copilotApi: null,

        // Options bar reference
        optionsBar: null,

        // Current session ID
        currentSessionId: null,

        // current open chat view
        currentOpenChatView: null,

        // one chat window is open
        chatOpen: false,

        // Constructor
        constructor: function(opts) {
            // If an instance already exists, return it
            if (instance) {
                return instance;
            }
            // Add any initialization logic here
            lang.mixin(this, opts);
            instance = this;
        },

        // Post-create lifecycle method
        postCreate: function() {
            // Hide or destroy if not logged in
            if (!window.App || !window.App.user || !window.App.user.id) {
                if (this.destroy) {
                    this.destroy();
                } else {
                    this.domNode.style.display = 'none';
                }
                return;
            }

            this.inherited(arguments);

            // Hide the button if on /view/Copilot page
            if (window.location && window.location.pathname && window.location.pathname.indexOf('/view/Copilot') === 0) {
                this.domNode.style.display = 'none';
                return;
            }

            // Set the button icon
            this.set('label', '<i class="fa fa-comments"></i>');
            domClass.add(this.domNode, 'ChatButton');

            // Make the button draggable
            this._makeButtonDraggable();
        },

        _makeButtonDraggable: function() {
            var button = this.domNode;
            button.style.position = 'fixed';
            button.style.zIndex = 10000;
            if (!button.style.left) button.style.left = '10px';
            if (!button.style.top) button.style.top = '70%';

            var saved = localStorage.getItem('copilotButtonPos');
            if (saved) {
                var pos = JSON.parse(saved);
                button.style.left = pos.left;
                button.style.top = pos.top;
            }

            let isDragging = false, offset = {x:0, y:0};

            // Helper to update chat position if open
            this._updateMiniChatPosition = () => {
                if (!this.chatContainer) return;
                var buttonRect = button.getBoundingClientRect();
                var chatWidth = 500;
                var chatHeight = 600;
                var offsetVal = 45;
                var showBelow = buttonRect.top < window.innerHeight / 2;
                var top, left;
                if (showBelow) {
                    top = buttonRect.bottom + offsetVal;
                    if (top + chatHeight > window.innerHeight) top = window.innerHeight - chatHeight - 10;
                } else {
                    top = buttonRect.top - chatHeight - offsetVal;
                    if (top < 10) top = 10;
                }
                if (buttonRect.left < window.innerWidth / 2) {
                    left = 10;
                } else {
                    left = window.innerWidth - chatWidth - 10;
                }
                this.chatContainer.style.top = top + 'px';
                this.chatContainer.style.left = left + 'px';
            };

            button.addEventListener('mousedown', (e) => {
                isDragging = true;
                offset.x = e.clientX - button.getBoundingClientRect().left;
                offset.y = e.clientY - button.getBoundingClientRect().top;
                document.body.style.userSelect = 'none';
            });

            document.addEventListener('mousemove', (e) => {
                if (!isDragging) return;
                let left = e.clientX - offset.x;
                let top = e.clientY - offset.y;
                left = Math.max(0, Math.min(left, window.innerWidth - button.offsetWidth));
                top = Math.max(0, Math.min(top, window.innerHeight - button.offsetHeight));
                button.style.left = left + 'px';
                button.style.top = top + 'px';
                // Update chat position if open
                this._updateMiniChatPosition();
            });

            document.addEventListener('mouseup', () => {
                if (!isDragging) return;
                isDragging = false;
                document.body.style.userSelect = '';
                let left = parseInt(button.style.left, 10);
                let snapLeft = 10, snapRight = window.innerWidth - button.offsetWidth - 10;
                if (left < window.innerWidth / 2) {
                    button.style.left = snapLeft + 'px';
                } else {
                    button.style.left = snapRight + 'px';
                }
                // Save position
                localStorage.setItem('copilotButtonPos', JSON.stringify({
                    left: button.style.left,
                    top: button.style.top
                }));
                // Update chat position if open
                this._updateMiniChatPosition();
            });
        },

        _createOptionsDialog: function() {
            // Create options as a tooltip dialog
            this.optionsDialog = new TooltipDialog({
                class: "copilotOptionsTooltip",
                style: "width: 200px;"
            });

            // Create content for tooltip
            var contentDiv = domConstruct.create("div", {
                style: "padding: 10px; text-align: center;"
            });

            // Create smaller button
            var smallerButton = new Button({
                label: "Smaller",
                onClick: lang.hitch(this, function(evt) {
                    popup.close(this.optionsDialog);
                    this._openSmallChat();
                    evt.stopPropagation();
                })
            }).placeAt(contentDiv);

            // Add space between buttons
            domConstruct.create("span", {
                innerHTML: "&nbsp;&nbsp;&nbsp;",
                style: "margin: 0 10px;"
            }, contentDiv);

            // Create larger button
            var largerButton = new Button({
                label: "Larger",
                onClick: lang.hitch(this, function(evt) {
                    popup.close(this.optionsDialog);
                    this._openLargeChat();
                    evt.stopPropagation();
                })
            }).placeAt(contentDiv);

            this.optionsDialog.set("content", contentDiv);
        },

        _openSmallChat: function() {
            // If controller panel already exists, just show it
            if (this.controllerPanel && this.controllerPanel.domNode) {
                if (this.chatContainer) {
                    this._showControllerPanel();
                }
                return;
            }

            // Initialize copilotApi if it doesn't exist
            if (!this.copilotApi) {
                this.copilotApi = new CopilotAPI({
                    user_id: window.App.user.l_id
                });
            }

            // Initialize optionsBar if it doesn't exist
            if (!this.optionsBar) {
                // Fetch model list and RAG database list
                this.copilotApi.getModelList().then(lang.hitch(this, function(modelsAndRag) {
                    var modelList = JSON.parse(modelsAndRag.models);
                    var ragList = JSON.parse(modelsAndRag.vdb_list);

                    // Create options bar
                    this.optionsBar = new ChatSessionOptionsBar({
                        region: 'top',
                        style: 'height: 40px;',
                        copilotApi: this.copilotApi,
                        modelList: modelList,
                        ragList: ragList
                    });

                    // Create and show controller panel
                    this._createControllerPanel();
                })).catch(lang.hitch(this, function(err) {
                    new Dialog({
                        title: "Service Unavailable",
                        content: "The BV-BRC Copilot service is currently unavailable. Please try again later.",
                        style: "width: 300px"
                    }).show();
                    console.error('Error setting up chat panel:', err);
                }));
            } else {
                // If we already have optionsBar, just create controller panel
                this._createControllerPanel();
            }
        },

        _createControllerPanel: function() {
            // Get the position of the floating button (this.domNode)
            var buttonRect = this.domNode.getBoundingClientRect();
            var chatWidth = 500;
            var chatHeight = 600;
            var offset = 10; // pixels between button and chat

            // Determine if button is near top or bottom
            var showBelow = buttonRect.top < window.innerHeight / 2;

            var top, left;
            if (showBelow) {
                top = buttonRect.bottom + offset;
                if (top + chatHeight > window.innerHeight) top = window.innerHeight - chatHeight - 10;
            } else {
                top = buttonRect.top - chatHeight - offset;
                if (top < 10) top = 10;
            }

            // Snap chat to left or right depending on button position
            if (buttonRect.left < window.innerWidth / 2) {
                left = 30; // Snap to left edge
            } else {
                left = window.innerWidth - chatWidth - 30; // Snap to right edge
            }

            // Create a container div for the chat panel
            this.chatContainer = domConstruct.create('div', {
                className: 'copilotChatContainer',
                style: `position: fixed; width: ${chatWidth}px; height: ${chatHeight}px; z-index: 9999; top: ${top}px; left: ${left}px; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15); border-radius: 8px; overflow: hidden; background-color: white; display: block;`
            }, document.body);

            // After chat is created, update its position in case button moved
            if (this._updateMiniChatPosition) {
                setTimeout(() => { this._updateMiniChatPosition(); }, 0);
            }

            // Add a draggable title bar to the top of the chatContainer (smallChat mode)
            var titleBar = domConstruct.create('div', {
                className: 'copilotChatTitleBar',
                style: 'width: 100%; height: 36px; background: #C7DCFD; display: flex; align-items: center; justify-content: flex-start; cursor: move; position: absolute; top: 0; left: 0; z-index: 10; border-bottom: 1px solid #e0e0e0;'
            }, this.chatContainer, 'first');
            var titleText = domConstruct.create('div', {
                innerHTML: 'Copilot Mini Chat',
                style: 'font-weight: bold; font-size: 1.1em; margin-left: 12px; color: #333; user-select: none;'
            }, titleBar);
            this.chatContainer.style.paddingTop = '36px';

            // Simplified drag logic for the copilotChatContainer (set left/top directly)
            (function(container, bar) {
                var isDragging = false;
                var offset = { x: 0, y: 0 };

                function onMouseMove(e) {
                    if (!isDragging) return;
                    var left = e.clientX - offset.x;
                    var top = e.clientY - offset.y;

                    // Clamp left and top so the window stays on screen
                    var maxLeft = window.innerWidth - container.offsetWidth;
                    var maxTop = window.innerHeight - container.offsetHeight;
                    left = Math.max(0, Math.min(left, maxLeft));
                    top = Math.max(0, Math.min(top, maxTop));

                    container.style.left = left + 'px';
                    container.style.top = top + 'px';
                    container.style.margin = '0';
                    container.style.position = 'fixed';
                }

                bar.addEventListener('mousedown', function(e) {
                    isDragging = true;
                    var rect = container.getBoundingClientRect();
                    offset.x = e.clientX - rect.left;
                    offset.y = e.clientY - rect.top;
                    document.body.style.userSelect = 'none';
                    document.addEventListener('mousemove', onMouseMove);
                    document.addEventListener('mouseup', onMouseUp);
                });

                function onMouseUp() {
                    isDragging = false;
                    document.body.style.userSelect = '';
                    document.removeEventListener('mousemove', onMouseMove);
                    document.removeEventListener('mouseup', onMouseUp);
                }
            })(this.chatContainer, titleBar);

            // Create controller panel inside the div
            this.controllerPanel = new ChatSessionControllerPanel({
                style: "width: 100%; height: 100%;",
                copilotApi: this.copilotApi,
                optionsBar: this.optionsBar
            });

            // Add the control panel to the container
            this.controllerPanel.placeAt(this.chatContainer);

            // If we have a current session from the large view, load it
            if (this.currentSessionId) {
                // Use setTimeout to ensure the controller panel is fully initialized
                setTimeout(lang.hitch(this, function() {
                    if (this.controllerPanel) {
                        this.controllerPanel.changeSessionId(this.currentSessionId);
                        console.log('get session messages', this.currentSessionId);
                        this.copilotApi.getSessionMessages(this.currentSessionId).then(lang.hitch(this, function(messages) {
                            if (messages.messages && messages.messages.length > 0 && messages.messages[0].messages) {
                                var messages = messages.messages[0].messages;
                                this.controllerPanel.chatStore.addMessages(messages);
                                this.controllerPanel.displayWidget.showMessages(messages);
                            }
                        }));

                        // Set the title if available
                        this.copilotApi.getSessionTitle(this.currentSessionId).then(lang.hitch(this, function(title_response) {
                            var title = title_response.title[0].title;
                            if (this.controllerPanel.titleWidget) {
                                this.controllerPanel.titleWidget.updateTitle(title);
                            }
                        }));
                    }
                }), 500);
            }

            // Force resize of panel after placement
            // Also get the session ID from the controller panel
            setTimeout(lang.hitch(this, function() {
                if (this.controllerPanel && this.controllerPanel.resize) {
                    this.controllerPanel.resize();
                }
                this.currentSessionId = this.controllerPanel.getSessionId();
            }), 100);

            // Add control buttons container to the right side of the title bar
            var buttonsContainer = domConstruct.create('div', {
                className: 'copilotChatButtonsContainer',
                style: 'display: flex; align-items: center; justify-content: flex-end; height: 100%; margin-left: auto; margin-right: 8px; gap: 8px;'
            }, titleBar);

            // Common style for all buttons
            var buttonStyle = 'width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; cursor: pointer; background-color: #e3eefd; border: none; border-radius: 50%; font-size: 18px; color: #333; transition: background 0.2s;';

            // Add new chat button
            var newChatButton = domConstruct.create('div', {
                className: 'copilotChatNewChatButton',
                style: buttonStyle,
                innerHTML: '+',
                title: 'New Chat (start a new session)'
            }, buttonsContainer);

            // Expand button
            var expandButton = domConstruct.create('div', {
                className: 'copilotChatExpandButton',
                style: buttonStyle,
                innerHTML: '<img src="/patric/images/expand.svg" style="width: 20px; height: 20px;" />',
                title: 'Expand to large view'
            }, buttonsContainer);


            // Close button
            var closeButton = domConstruct.create('div', {
                className: 'copilotChatCloseButton',
                style: buttonStyle,
                innerHTML: '✕',
                title: 'Close chat'
            }, buttonsContainer);

            // Expand button click handler - open large chat and hide small chat
            on(expandButton, 'click', lang.hitch(this, function(evt) {
                this._hideControllerPanel();
                this._openLargeChat();
                this.currentOpenChatView = 'large';
                evt.stopPropagation();
            }));

            // Close button click handler - hide panel and reset session
            on(newChatButton, 'click', lang.hitch(this, function(evt) {
                // Create a new chat session immediately
                if (this.copilotApi) {
                    this.copilotApi.getNewSessionId().then(lang.hitch(this, function(sessionId) {
                        this.currentSessionId = sessionId;

                        // Reset everything in the controller panel for the new session
                        if (this.controllerPanel) {
                            this.controllerPanel.changeSessionId(sessionId);

                            // Reset input widget and display
                            if (this.controllerPanel.inputWidget) {
                                this.controllerPanel.inputWidget.startNewChat();
                            }
                            if (this.controllerPanel.displayWidget) {
                                this.controllerPanel.displayWidget.startNewChat();
                            }
                            if (this.controllerPanel.titleWidget) {
                                this.controllerPanel.titleWidget.startNewChat(sessionId);
                            }
                        }
                    }));
                }
                evt.stopPropagation();
            }));

            // Minimize button click handler - just hide the panel
            on(closeButton, 'click', lang.hitch(this, function(evt) {
                this._hideControllerPanel();
                this.chatOpen = false;
                evt.stopPropagation();
            }));
        },

        _hideControllerPanel: function() {
            if (this.chatContainer) {
                domStyle.set(this.chatContainer, {
                    display: 'none'
                });
            }
        },

        _openLargeChat: function() {
            // If the large view dialog already exists, just show it
            if (this.largeViewDialog) {
                this.largeViewDialog.show();
                if (this.currentSessionId) {
                    this.gridContainer.rightContainer.changeSessionId(this.currentSessionId);
                    this.copilotApi.getSessionMessages(this.currentSessionId).then(lang.hitch(this, function(messages) {
                        if (messages.messages && messages.messages.length > 0 && messages.messages[0].messages) {
                            var messages = messages.messages[0].messages;
                            this.gridContainer.rightContainer.chatStore.addMessages(messages);
                            this.gridContainer.rightContainer.displayWidget.showMessages(messages);
                        } else {
                            this.gridContainer.rightContainer.chatStore.clearData();
                            this.gridContainer.rightContainer.displayWidget.clearMessages();
                        }
                    }));

                    this.copilotApi.getSessionTitle(this.currentSessionId).then(lang.hitch(this, function(title_response) {
                        if (title_response.title && title_response.title.length > 0 && title_response.title[0].title) {
                            var title = title_response.title[0].title;
                            this.gridContainer.rightContainer.titleWidget.updateTitle(title);
                        } else {
                            this.gridContainer.rightContainer.titleWidget.updateTitle("New Chat");
                        }
                    }));
                }
                return;
            }

            // get the vw and vh of the window
            var vw = window.innerWidth;
            var vh = window.innerHeight;

            // Create a new dialog for large view
            this.largeViewDialog = new Dialog({
                // title: "BV-BRC Copilot Large Chat",
                style: "width: " + (vw - 60) + "px; height: " + (vh - 40) + "px; left: 30px; top: 20px;",
                closable: false,
                onHide: lang.hitch(this, function() {
                    if (!this.currentSessionId || this.currentSessionId != this.gridContainer.rightContainer.getSessionId()) {
                        this.currentSessionId = this.gridContainer.rightContainer.getSessionId();
                    }
                    this.largeViewDialog.hide();
                    // this._openSmallChat();
                })
            });

            // Create a container node for the grid container
            var containerNode = domConstruct.create('div', {
                id: 'copilotLargeViewContainer',
                style: 'height: 100%; width: 100%;'
            });
            this.largeViewDialog.set('content', containerNode);

            // Update the title bar style for proper flex layout
            var titleBar = this.largeViewDialog.domNode.querySelector('.dijitDialogTitleBar');
            if (titleBar) {
                titleBar.style.display = 'flex';
                titleBar.style.alignItems = 'center';
                titleBar.style.position = 'relative';
                titleBar.style.width = '100%';
                titleBar.style.height = '36px';
                titleBar.style.background = '#C7DCFD';

                // Update or create the title text node
                var titleText = titleBar.querySelector('.copilotChatTitleText');
                if (!titleText) {
                    titleText = domConstruct.create('div', {
                        className: 'copilotChatTitleText',
                        innerHTML: 'Copilot Large Chat',
                        style: 'font-weight: bold; font-size: 1.1em; margin-left: 12px; color: #333; user-select: none; flex: 1 1 auto; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;'
                    }, titleBar, 'first');
                } else {
                    titleText.style.flex = '1 1 auto';
                    titleText.style.minWidth = '0';
                    titleText.style.whiteSpace = 'nowrap';
                    titleText.style.overflow = 'hidden';
                    titleText.style.textOverflow = 'ellipsis';
                }

                // Create a flex container for the buttons
                var buttonsContainer = domConstruct.create('div', {
                    className: 'copilotChatButtonsContainer',
                    style: 'display: flex; align-items: center; justify-content: flex-end; height: 100%; flex: 0 0 auto; gap: 8px;'
                }, titleBar);

                // Common style for all buttons
                var buttonStyle = 'width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; cursor: pointer; background-color: #e3eefd; border: none; border-radius: 50%; font-size: 18px; color: #333; transition: background 0.2s;';

                // Shrink button (↖)
                var shrinkButton = domConstruct.create('div', {
                    className: 'copilotChatShrinkButton',
                    style: buttonStyle,
                    innerHTML: '<img src="/patric/images/shrink.svg" style="width: 20px; height: 20px;" />',
                    title: 'Shrink to mini view'
                }, buttonsContainer);

                // Close button (✕)
                var closeButton = domConstruct.create('div', {
                    className: 'copilotChatCloseButton',
                    style: buttonStyle,
                    innerHTML: '✕',
                    title: 'Close chat'
                }, buttonsContainer);

                // Shrink button click handler - close large chat and open small chat
                on(shrinkButton, 'click', lang.hitch(this, function(evt) {
                    if (!this.currentSessionId || this.currentSessionId != this.gridContainer.rightContainer.getSessionId()) {
                        this.currentSessionId = this.gridContainer.rightContainer.getSessionId();
                    }
                    this.largeViewDialog.hide();
                    this._openSmallChat();
                    this.currentOpenChatView = 'small';
                    evt.stopPropagation();
                }));

                // Close button click handler
                on(closeButton, 'click', lang.hitch(this, function(evt) {
                    this.largeViewDialog.hide();
                    this.chatOpen = false;
                    evt.stopPropagation();
                }));
            }

            var DialogPane = this.largeViewDialog.domNode.querySelector('.dijitDialogPaneContent');
            DialogPane.style.paddingLeft = '0px';

            // Make the dialog draggable by its title bar
            if (titleBar) {
                var isDragging = false;
                var offset = { x: 0, y: 0 };
                titleBar.style.cursor = 'move';
                var dialogNode = this.largeViewDialog.domNode;

                titleBar.addEventListener('mousedown', function(e) {
                    isDragging = true;
                    var rect = dialogNode.getBoundingClientRect();
                    offset.x = e.clientX - rect.left;
                    offset.y = e.clientY - rect.top;
                    document.body.style.userSelect = 'none';
                });

                document.addEventListener('mousemove', function(e) {
                    if (isDragging) {
                        var left = e.clientX - offset.x;
                        var top = e.clientY - offset.y;
                        dialogNode.style.left = left + 'px';
                        dialogNode.style.top = top + 'px';
                        dialogNode.style.margin = '0';
                        dialogNode.style.position = 'fixed';
                    }
                });

                document.addEventListener('mouseup', function() {
                    isDragging = false;
                    document.body.style.userSelect = '';
                });
            }

            // Initialize copilotApi if it doesn't exist
            if (!this.copilotApi) {
                this.copilotApi = new CopilotAPI({
                    user_id: window.App.user.l_id
                });
            }

            // Fetch model list and RAG database list
            this.copilotApi.getModelList().then(lang.hitch(this, function(modelsAndRag) {
                var modelList = JSON.parse(modelsAndRag.models);
                var ragList = JSON.parse(modelsAndRag.vdb_list);

                // Create main grid container in dialog
                this.gridContainer = new CopilotGridContainer({
                    copilotApi: this.copilotApi,
                    style: 'height: 100%; width: 100%;'
                }, containerNode);

                // Show the dialog after container is created
                this.largeViewDialog.show();

                setTimeout(lang.hitch(this, function() {
                    if (this.currentSessionId) {
                        this.gridContainer.rightContainer.changeSessionId(this.currentSessionId);
                        this.copilotApi.getSessionMessages(this.currentSessionId).then(lang.hitch(this, function(messages) {
                            if (messages.messages && messages.messages.length > 0 && messages.messages[0].messages) {
                                var messages = messages.messages[0].messages;
                                this.gridContainer.rightContainer.chatStore.addMessages(messages);
                                this.gridContainer.rightContainer.displayWidget.showMessages(messages);
                            }
                        }));

                        this.copilotApi.getSessionTitle(this.currentSessionId).then(lang.hitch(this, function(title_response) {
                            if (title_response.title && title_response.title.length > 0 && title_response.title[0].title) {
                                var title = title_response.title[0].title;
                                this.gridContainer.rightContainer.titleWidget.updateTitle(title);
                            } else {
                                this.gridContainer.rightContainer.titleWidget.updateTitle("New Chat");
                            }
                        }));
                    } else {
                        this.currentSessionId = this.gridContainer.rightContainer.getSessionId();
                    }
                }), 500);
            })).catch(lang.hitch(this, function(err) {
                // Show error dialog if service is unavailable
                new Dialog({
                    title: "Service Unavailable",
                    content: "The BV-BRC Copilot service is currently unavailable. Please try again later.",
                    style: "width: 300px"
                }).show();
                console.error('Error setting up large chat view:', err);
            }));
        },

        _showControllerPanel: function() {
            if (this.chatContainer) {
                domStyle.set(this.chatContainer, {
                    display: 'block'
                });

                // Check if we need to start a new session: happens when clicking the close button on the small chat
                if (this.startNewSession && this.controllerPanel) {
                    this.startNewSession = false;

                    // Create a new chat session
                    if (this.copilotApi) {
                        this.copilotApi.getNewSessionId().then(lang.hitch(this, function(sessionId) {
                            if (this.controllerPanel) {
                                this.currentSessionId = sessionId;
                                // Change the session ID and reset the chat components
                                this.controllerPanel.changeSessionId(sessionId);

                                // Reset input widget and display
                                if (this.controllerPanel.inputWidget) {
                                    this.controllerPanel.inputWidget.startNewChat();
                                }
                                if (this.controllerPanel.displayWidget) {
                                    this.controllerPanel.displayWidget.startNewChat();
                                }
                                if (this.controllerPanel.titleWidget) {
                                    this.controllerPanel.titleWidget.startNewChat(sessionId);
                                }
                            }
                        }));
                    }
                } else {
                    // happens when clicking the minimize button on the large chat
                    this.controllerPanel.changeSessionId(this.currentSessionId);
                    this.copilotApi.getSessionMessages(this.currentSessionId).then(lang.hitch(this, function(messages) {
                        if (messages.messages && messages.messages.length > 0 && messages.messages[0].messages) {
                            var messages = messages.messages[0].messages;
                            this.controllerPanel.chatStore.addMessages(messages);
                            this.controllerPanel.displayWidget.showMessages(messages);
                        }
                    }));

                    // Set the title if available
                    this.copilotApi.getSessionTitle(this.currentSessionId).then(lang.hitch(this, function(title_response) {
                        if (title_response.title && title_response.title.length > 0 && title_response.title[0].title) {
                            var title = title_response.title[0].title;
                            if (this.controllerPanel.titleWidget) {
                                this.controllerPanel.titleWidget.updateTitle(title);
                            }
                        }
                    }));
                }
            }
        },

        // Override onClick to show the controller panel
        onClick: function(evt) {
            this.inherited(arguments);
            /*
            popup.open({
                popup: this.optionsDialog,
                around: this.domNode
            });
            */
            if (!this.chatOpen) {
                if (!this.currentOpenChatView) {
                    this._openSmallChat();
                    this.currentOpenChatView = 'small';
                } else if (this.currentOpenChatView == 'large') {
                    this._openLargeChat();
                } else {
                    this._openSmallChat();
                }
                this.chatOpen = true;
                evt.stopPropagation();
            } else {
                if (this.currentOpenChatView == 'small') {
                    this._hideControllerPanel();
                } else if (this.currentOpenChatView == 'large') {
                    this.largeViewDialog.hide();
                }
                this.chatOpen = false;
            }
            evt.stopPropagation();
        },

        // Method to update button state
        updateState: function(isOpen) {
            domClass.toggle(this.domNode, 'active', isOpen);
        }
    });

    return ChatButton;
});