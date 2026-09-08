import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import * as React from 'react';
import { StyleProp, TextStyle } from 'react-native';
import { colors } from '../theme/tokens';

export type IconName =
  | 'graphic_eq'
  | 'blur_on'
  | 'mic'
  | 'stop_circle'
  | 'flight_takeoff'
  | 'flight'
  | 'thermostat'
  | 'arrow_forward'
  | 'arrow_back'
  | 'event_note'
  | 'add'
  | 'bolt'
  | 'database'
  | 'history'
  | 'settings'
  | 'person'
  | 'memory'
  | 'storage'
  | 'lan'
  | 'shield'
  | 'calendar_today'
  | 'paragliding'
  | 'beach_access'
  | 'my_location'
  | 'location_on'
  | 'location_off'
  | 'schedule'
  | 'hourglass_empty'
  | 'insights'
  | 'menu'
  | 'more_vert'
  | 'more_horiz'
  | 'check'
  | 'delete'
  | 'search'
  | 'refresh'
  | 'expand_more'
  | 'record_voice_over'
  | 'hub'
  | 'chat_bubble'
  | 'home'
  | 'error'
  | 'hearing'
  | 'headset'
  | 'phone_android'
  | 'close'
  | 'bookmark'
  | 'play_arrow'
  | 'pause'
  | 'stop'
  | 'music_note'
  | 'insights';

export interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  style?: StyleProp<TextStyle>;
}

export function Icon({
  name,
  size = 20,
  color = colors.primaryFixed,
  style,
}: IconProps): React.ReactElement {
  switch (name) {
    case 'graphic_eq':
      return <MaterialIcons name="graphic-eq" size={size} color={color} style={style} />;
    case 'blur_on':
      return <MaterialIcons name="blur-on" size={size} color={color} style={style} />;
    case 'mic':
      return <MaterialIcons name="mic" size={size} color={color} style={style} />;
    case 'stop_circle':
      return <MaterialIcons name="stop-circle" size={size} color={color} style={style} />;
    case 'flight_takeoff':
      return <MaterialIcons name="flight-takeoff" size={size} color={color} style={style} />;
    case 'flight':
      return <MaterialIcons name="flight" size={size} color={color} style={style} />;
    case 'thermostat':
      return <MaterialIcons name="thermostat" size={size} color={color} style={style} />;
    case 'arrow_forward':
      return <MaterialIcons name="arrow-forward" size={size} color={color} style={style} />;
    case 'arrow_back':
      return <MaterialIcons name="arrow-back" size={size} color={color} style={style} />;
    case 'event_note':
      return <MaterialIcons name="event-note" size={size} color={color} style={style} />;
    case 'add':
      return <MaterialIcons name="add" size={size} color={color} style={style} />;
    case 'bolt':
      return <MaterialIcons name="bolt" size={size} color={color} style={style} />;
    case 'database':
      return <MaterialCommunityIcons name="database" size={size} color={color} style={style} />;
    case 'history':
      return <MaterialIcons name="history" size={size} color={color} style={style} />;
    case 'settings':
      return <MaterialIcons name="settings" size={size} color={color} style={style} />;
    case 'person':
      return <MaterialIcons name="person" size={size} color={color} style={style} />;
    case 'memory':
      return <MaterialIcons name="memory" size={size} color={color} style={style} />;
    case 'storage':
      return <MaterialIcons name="storage" size={size} color={color} style={style} />;
    case 'lan':
      return <MaterialIcons name="lan" size={size} color={color} style={style} />;
    case 'shield':
      return <MaterialIcons name="shield" size={size} color={color} style={style} />;
    case 'calendar_today':
      return <MaterialIcons name="calendar-today" size={size} color={color} style={style} />;
    case 'paragliding':
      return <MaterialCommunityIcons name="paragliding" size={size} color={color} style={style} />;
    case 'beach_access':
      return <MaterialIcons name="beach-access" size={size} color={color} style={style} />;
    case 'my_location':
      return <MaterialIcons name="my-location" size={size} color={color} style={style} />;
    case 'location_on':
      return <MaterialIcons name="location-on" size={size} color={color} style={style} />;
    case 'location_off':
      return <MaterialIcons name="location-off" size={size} color={color} style={style} />;
    case 'schedule':
      return <MaterialIcons name="schedule" size={size} color={color} style={style} />;
    case 'hourglass_empty':
      return <MaterialIcons name="hourglass-empty" size={size} color={color} style={style} />;
    case 'insights':
      return <MaterialIcons name="insights" size={size} color={color} style={style} />;
    case 'menu':
      return <MaterialIcons name="menu" size={size} color={color} style={style} />;
    case 'more_vert':
      return <MaterialIcons name="more-vert" size={size} color={color} style={style} />;
    case 'more_horiz':
      return <MaterialIcons name="more-horiz" size={size} color={color} style={style} />;
    case 'check':
      return <MaterialIcons name="check" size={size} color={color} style={style} />;
    case 'delete':
      return <MaterialIcons name="delete-outline" size={size} color={color} style={style} />;
    case 'search':
      return <MaterialIcons name="search" size={size} color={color} style={style} />;
    case 'refresh':
      return <MaterialIcons name="refresh" size={size} color={color} style={style} />;
    case 'expand_more':
      return <MaterialIcons name="expand-more" size={size} color={color} style={style} />;
    case 'record_voice_over':
      return <MaterialIcons name="record-voice-over" size={size} color={color} style={style} />;
    case 'hub':
      return <MaterialIcons name="hub" size={size} color={color} style={style} />;
    case 'chat_bubble':
      return <MaterialIcons name="chat-bubble-outline" size={size} color={color} style={style} />;
    case 'error':
      return <MaterialIcons name="error-outline" size={size} color={color} style={style} />;
    case 'home':
      return <MaterialIcons name="home" size={size} color={color} style={style} />;
    case 'bookmark':
      return <MaterialIcons name="bookmark-border" size={size} color={color} style={style} />;
    case 'hearing':
      return <MaterialIcons name="hearing" size={size} color={color} style={style} />;
    case 'headset':
      return <MaterialIcons name="headset" size={size} color={color} style={style} />;
    case 'phone_android':
      return <MaterialIcons name="phone-android" size={size} color={color} style={style} />;
    case 'close':
      return <MaterialIcons name="close" size={size} color={color} style={style} />;
    case 'play_arrow':
      return <MaterialIcons name="play-arrow" size={size} color={color} style={style} />;
    case 'pause':
      return <MaterialIcons name="pause" size={size} color={color} style={style} />;
    case 'stop':
      return <MaterialIcons name="stop" size={size} color={color} style={style} />;
    case 'music_note':
      return <MaterialIcons name="music-note" size={size} color={color} style={style} />;
    default:
      return <MaterialIcons name="blur-on" size={size} color={color} style={style} />;
  }
}
