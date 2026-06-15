        // MESSAGES/CHAT FUNCTIONALITY
        // ----------------------------------------====

        let currentChatUser = null;

        // Helper function to get chat initialization key
        function getChatInitKey(userId) {
            return `goride_chat_initialized_${userId}`;
        }

        function loadMessages() {
            if (typeof MessageDB === 'undefined') {
                console.error('MessageDB not loaded');
                return;
            }

            const currentUserId = getCustomerWalletOwnerId();
            const conversations = MessageDB.getUserConversations(currentUserId);
            const conversationsList = document.getElementById('conversationsList');

            // Update unread badge
            const unreadCount = MessageDB.getUnreadCount(currentUserId);
            const badge = document.getElementById('unreadBadge');
            if (unreadCount > 0) {
                badge.textContent = unreadCount;
                badge.style.display = 'inline';
            } else {
                badge.style.display = 'none';
            }

            if (conversations.length === 0) {
                conversationsList.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-comments" style="font-size: 3rem; margin-bottom: 1rem;"></i>
                        <h3 style="color: #333; margin-bottom: 0.5rem;">Abhi koi purani chat nahi hai</h3>
                        <p style="color: #666; margin-bottom: 1rem;">No previous chats yet. Book a ride to start messaging with drivers!</p>
                        <a href="booking.html" style="color: #080c12; text-decoration: none; font-weight: bold;">
                            📱 Book Your First Ride
                        </a>
                    </div>
                `;
                return;
            }

            conversationsList.innerHTML = conversations.map(conv => {
                // Get user info (driver)
                const drivers = JSON.parse(localStorage.getItem('goride_drivers')) || [];
                const driver = drivers.find(d => d.id === conv.userId);
                const driverName = driver ? driver.name : 'Unknown Driver';
                const driverAvatar = driver ? driver.photo : '👤';

                return `
                    <div class="conversation-item" onclick="openChat('${conv.userId}')">
                        <div class="user-avatar">${driverAvatar}</div>
                        <div class="conversation-info">
                            <div class="conversation-name">${driverName}</div>
                            <div class="conversation-last-message">${conv.lastMessage}</div>
                        </div>
                        <div>
                            <div class="conversation-time">${formatTimestamp(conv.timestamp)}</div>
                            ${conv.unread ? '<span class="badge">New</span>' : ''}
                        </div>
                    </div>
                `;
            }).join('');
        }

        function openChat(driverId) {
            currentChatUser = driverId;

            // Get driver info
            const drivers = JSON.parse(localStorage.getItem('goride_drivers')) || [];
            const driver = drivers.find(d => d.id === driverId);

            if (!driver) {
                alert('Driver not found');
                return;
            }

            // Update chat header
            document.getElementById('chatUserAvatar').textContent = driver.photo;
            document.getElementById('chatUserName').textContent = driver.name;
            document.getElementById('chatUserStatus').textContent = driver.status === 'available' ? 'Available' : 'Busy';

            // Show chat window
            document.getElementById('conversationsList').style.display = 'none';
            document.getElementById('chatWindow').style.display = 'flex';

            // Mark messages as read
            MessageDB.markConversationAsRead(getCustomerWalletOwnerId(), driverId);

            // Load messages
            loadChatMessages(driverId);

            // Update unread badge
            const unreadCount = MessageDB.getUnreadCount(getCustomerWalletOwnerId());
            const badge = document.getElementById('unreadBadge');
            if (unreadCount > 0) {
                badge.textContent = unreadCount;
                badge.style.display = 'inline';
            } else {
                badge.style.display = 'none';
            }
        }

        function loadChatMessages(driverId) {
            const currentUserId = getCustomerWalletOwnerId();
            const messages = MessageDB.getConversation(currentUserId, driverId);
            const chatMessages = document.getElementById('chatMessages');

            if (messages.length === 0) {
                chatMessages.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-comment" style="font-size: 3rem; margin-bottom: 1rem;"></i>
                        <h3 style="color: #333; margin-bottom: 0.5rem;">Abhi koi message nahi hai</h3>
                        <p style="color: #666;">No messages yet. Say hi! 👋</p>
                        <p style="color: #999; font-size: 0.9rem; margin-top: 0.5rem;">
                            💡 Type a message below to start the conversation
                        </p>
                    </div>
                `;
                return;
            }

            chatMessages.innerHTML = messages.map(msg => {
                const isSent = msg.senderId === currentUserId;
                return `
                    <div class="message ${isSent ? 'sent' : 'received'}">
                        <div class="message-content">
                            ${msg.content}
                            <div class="message-time">${formatTimestamp(msg.timestamp)}</div>
                        </div>
                    </div>
                `;
            }).join('');

            // Scroll to bottom
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }

        function closeChat() {
            document.getElementById('conversationsList').style.display = 'block';
            document.getElementById('chatWindow').style.display = 'none';
            currentChatUser = null;
            loadMessages(); // Refresh conversations list
        }

        function notifyLiveDriverChat(driverId, content) {
            if (!window.PortalConnector || typeof window.PortalConnector.createNotification !== 'function') return;
            window.PortalConnector.createNotification({
                type: 'customer_driver_message',
                title: 'Customer message',
                message: content.slice(0, 160),
                sourcePortal: 'customer',
                targetPortals: ['driver', 'admin'],
                metadata: {
                    driverId,
                    customerId: getCustomerWalletOwnerId(),
                    channel: 'customer_dashboard_chat',
                    liveMode: true
                }
            });
        }

        function sendMessage() {
            const input = document.getElementById('messageInput');
            const content = input.value.trim();

            if (!content || !currentChatUser) return;

            // Create message
            MessageDB.create({
                senderId: getCustomerWalletOwnerId(),
                receiverId: currentChatUser,
                content: content,
                read: false
            });

            // Clear input
            input.value = '';

            // Reload chat
            loadChatMessages(currentChatUser);
            notifyLiveDriverChat(currentChatUser, content);
        }

        function handleMessageKeyPress(event) {
            if (event.key === 'Enter') {
                sendMessage();
            }
        }

        function formatTimestamp(timestamp) {
            const date = new Date(timestamp);
            const now = new Date();
            const diff = now - date;
            const minutes = Math.floor(diff / 60000);
            const hours = Math.floor(diff / 3600000);
            const days = Math.floor(diff / 86400000);

            if (minutes < 1) return 'Just now';
            if (minutes < 60) return `${minutes}m ago`;
            if (hours < 24) return `${hours}h ago`;
            if (days < 7) return `${days}d ago`;
            return date.toLocaleDateString();
        }

        function goHome() {
            window.location.href = '../index.html';
        }

        function logout() {
            if (confirm('Are you sure you want to logout?')) {
                if (window.GoIndiaSessionContinuity && typeof window.GoIndiaSessionContinuity.clearAuthArtifacts === 'function') {
                    window.GoIndiaSessionContinuity.clearAuthArtifacts();
                }
                localStorage.removeItem('currentUser');
                localStorage.removeItem('userRole');
                localStorage.removeItem('accessToken');
                localStorage.removeItem('authToken');
                localStorage.removeItem('token');
                localStorage.removeItem('goindiaride_refresh_token');
                localStorage.removeItem('goindiaride_refresh_token_v1');
                window.location.href = './login.html';
            }
        }

        console.log('🚀 Customer Dashboard loaded');
